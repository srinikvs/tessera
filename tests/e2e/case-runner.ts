import { expect, type Page } from "@playwright/test";
import { buildBoard, resolveTray, type BoardSpec, type PieceName } from "../cases/fixtures.ts";
import type { CaseFile, Expectation, Step } from "../cases/types.ts";
import {
  boardMetrics,
  dragTrayToCell,
  filledTrayCount,
  formatScore,
  makeSave,
  openFresh,
  readBest,
  readSave,
  seedAndOpen,
  waitForBoardMetrics,
  waitForFilledTray,
} from "./helpers.ts";

async function pieceMetrics(page: Page, slot: number) {
  const well = page.getByTestId(`tray-slot-${slot}`);
  const piece = well.locator(".mini-piece");
  await expect(piece).toBeVisible();
  const tiles = await piece.evaluate((el) => {
    const cs = getComputedStyle(el);
    const spans = [...el.querySelectorAll("span")].filter((s) => {
      const bg = getComputedStyle(s).backgroundColor;
      return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
    });
    const fr = (spans[0] ?? el.querySelector("span"))?.getBoundingClientRect();
    return {
      cell: parseFloat(cs.getPropertyValue("--cell")),
      tileW: fr?.width ?? 0,
      tileH: fr?.height ?? 0,
    };
  });
  return {
    ...tiles,
    well: await well.boundingBox(),
    box: await piece.boundingBox(),
  };
}

async function applyExpect(page: Page, exp: Expectation, caseId: string): Promise<void> {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "visible":
      await expect(page.getByTestId(String(exp.testId)), tag).toBeVisible();
      return;
    case "count": {
      const loc = exp.selector
        ? page.getByTestId(String(exp.testId)).locator(String(exp.selector))
        : page.getByTestId(String(exp.testId));
      await expect(loc, tag).toHaveCount(Number(exp.value));
      return;
    }
    case "text": {
      const re = new RegExp(String(exp.match));
      await expect(page.getByTestId(String(exp.testId)), tag).toHaveText(re);
      return;
    }
    case "textEquals":
      await expect(page.getByTestId(String(exp.testId)), tag).toHaveText(String(exp.value));
      return;
    case "textNot":
      await expect(page.getByTestId(String(exp.testId)), tag).not.toHaveText(String(exp.value));
      return;
    case "below": {
      const above = await page.getByTestId(String(exp.above)).boundingBox();
      const below = await page.getByTestId(String(exp.below)).boundingBox();
      expect(above && below, tag).toBeTruthy();
      expect(below!.y, tag).toBeGreaterThan(above!.y);
      return;
    }
    case "heading":
      await expect(page.getByRole("heading", { name: String(exp.name) }), tag).toBeVisible();
      return;
    case "enabled":
      await expect(page.getByTestId(String(exp.testId)), tag).toBeEnabled();
      return;
    case "best": {
      const formatted = `Best ${formatScore(Number(exp.value))}`;
      await expect(page.getByTestId("best"), tag).toHaveText(formatted);
      if (exp.storage) await expect.poll(async () => readBest(page), { message: tag }).toBe(Number(exp.value));
      return;
    }
    case "score":
      await expect(page.getByTestId("score"), tag).toHaveText(formatScore(Number(exp.value)));
      return;
    case "storageBest":
      await expect.poll(async () => readBest(page), { message: tag }).toBe(Number(exp.value));
      return;
    case "boardCell":
      await expect
        .poll(
          async () => {
            const save = await readSave(page);
            return save?.board[Number(exp.r)][Number(exp.c)];
          },
          { message: tag },
        )
        .toBe(Number(exp.value));
      return;
    case "boardEmptyRow":
      await expect
        .poll(
          async () => {
            const save = await readSave(page);
            return save?.board[Number(exp.row)].every((v) => v === 0);
          },
          { message: tag },
        )
        .toBe(true);
      return;
    case "filledTray":
      await waitForFilledTray(page, Number(exp.min ?? exp.value ?? 1));
      if (exp.equals != null) expect(await filledTrayCount(page), tag).toBe(Number(exp.equals));
      return;
    case "viewport": {
      const vp = page.viewportSize();
      expect(vp, tag).toEqual({ width: Number(exp.width), height: Number(exp.height) });
      return;
    }
    case "inViewport": {
      const vp = page.viewportSize()!;
      const ids = (Array.isArray(exp.testId) ? exp.testId : [exp.testId]) as string[];
      for (const id of ids) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.y, `${tag} ${id} top`).toBeGreaterThanOrEqual(-1);
        expect(box!.y + box!.height, `${tag} ${id} bottom`).toBeLessThanOrEqual(vp.height + 1);
      }
      return;
    }
    case "boardAboveTray": {
      const hud = await page.getByTestId("hud").boundingBox();
      const tray = await page.getByTestId("tray").boundingBox();
      const m = await boardMetrics(page);
      expect(hud && tray, tag).toBeTruthy();
      expect(m.cell, tag).toBeGreaterThanOrEqual(Number(exp.minCell ?? 28));
      expect(m.boardPx, tag).toBeGreaterThanOrEqual(Number(exp.minBoardPx ?? 280));
      expect(m.boardY, tag).toBeGreaterThanOrEqual((hud?.height ?? 0) - 8);
      expect(m.boardY + m.boardPx, tag).toBeLessThanOrEqual((tray?.y ?? 0) + 2);
      return;
    }
    case "midGap": {
      const tray = await page.getByTestId("tray").boundingBox();
      const m = await boardMetrics(page);
      expect(tray, tag).toBeTruthy();
      const gap = tray!.y - (m.boardY + m.boardPx);
      expect(gap, `${tag} present (v1.1.22 over-tighten rejected)`).toBeGreaterThanOrEqual(Number(exp.min ?? 8));
      if (exp.max != null) expect(gap, `${tag} not over-tight required`).toBeLessThan(Number(exp.max));
      return;
    }
    case "minCell": {
      const m = await boardMetrics(page);
      expect(m.cell, tag).toBeGreaterThanOrEqual(Number(exp.value));
      return;
    }
    case "trayContained": {
      const slots = (exp.slots as number[]) ?? [0, 1, 2];
      for (const slot of slots) {
        const p = await pieceMetrics(page, slot);
        expect(p.well && p.box, `${tag} slot ${slot}`).toBeTruthy();
        expect(p.box!.x, `${tag} slot ${slot}`).toBeGreaterThanOrEqual(p.well!.x - 2);
        expect(p.box!.y, `${tag} slot ${slot}`).toBeGreaterThanOrEqual(p.well!.y - 2);
        expect(p.box!.x + p.box!.width, `${tag} slot ${slot}`).toBeLessThanOrEqual(p.well!.x + p.well!.width + 2);
        expect(p.box!.y + p.box!.height, `${tag} slot ${slot}`).toBeLessThanOrEqual(p.well!.y + p.well!.height + 2);
      }
      return;
    }
    case "cellParity": {
      const m = await boardMetrics(page);
      const p = await pieceMetrics(page, Number(exp.slot));
      expect(Math.abs(p.cell - m.cell), tag).toBeLessThanOrEqual(Number(exp.maxDelta ?? 2));
      return;
    }
    case "pieceMinHeight": {
      const m = await boardMetrics(page);
      const p = await pieceMetrics(page, Number(exp.slot));
      expect(p.box, tag).toBeTruthy();
      expect(p.box!.height, tag).toBeGreaterThanOrEqual(m.cell * Number(exp.cells) - 4);
      return;
    }
    case "pieceUnclipped": {
      const vp = page.viewportSize()!;
      const p = await pieceMetrics(page, Number(exp.slot));
      expect(p.box, tag).toBeTruthy();
      expect(p.box!.y + p.box!.height, tag).toBeLessThanOrEqual(vp.height + 1);
      return;
    }
    case "squareTiles": {
      const slots = (exp.slots as number[]) ?? [0, 1, 2];
      for (const slot of slots) {
        const p = await pieceMetrics(page, slot);
        expect(Math.abs(p.tileW - p.tileH), `${tag} slot ${slot}`).toBeLessThanOrEqual(Number(exp.maxDelta ?? 1.5));
        expect(p.tileW, `${tag} slot ${slot}`).toBeGreaterThan(4);
      }
      return;
    }
    default:
      throw new Error(`${tag}: unknown e2e/pixel assert "${exp.assert}"`);
  }
}

async function runStep(page: Page, step: Step, c: CaseFile): Promise<void> {
  switch (step.op) {
    case "openFresh":
      await openFresh(page);
      return;
    case "seedPlay": {
      const trayNames = (step.tray as Array<PieceName | null>) ?? ["mono", "square", "vertDomino"];
      const save = makeSave({
        board: buildBoard(step.board as BoardSpec | undefined),
        tray: resolveTray(trayNames),
        score: Number(step.score ?? 10),
        best: Number(step.best ?? step.score ?? 10),
      });
      await seedAndOpen(page, save, Number(step.best ?? save.best));
      await waitForBoardMetrics(page);
      return;
    }
    case "click":
      await page.getByTestId(String(step.testId)).click();
      return;
    case "dragTrayToCell":
      await dragTrayToCell(page, Number(step.slot), Number(step.row), Number(step.col));
      return;
    case "reload":
      await page.reload();
      await waitForBoardMetrics(page).catch(() => undefined);
      return;
    case "waitFilledTray":
      await waitForFilledTray(page, Number(step.min ?? 1));
      return;
    case "expect":
      await applyExpect(page, step as unknown as Expectation, c.id);
      return;
    default:
      throw new Error(`${c.id}: unknown e2e op "${step.op}"`);
  }
}

export async function runE2ECase(page: Page, c: CaseFile): Promise<void> {
  for (const step of c.steps) await runStep(page, step, c);
  for (const exp of c.expect) await applyExpect(page, exp, c.id);
}
