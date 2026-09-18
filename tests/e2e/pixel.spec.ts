import { expect, test } from "@playwright/test";
import {
  I5_TALL,
  I5_WIDE,
  MONO,
  SQUARE,
  VERT_DOMINO,
  boardMetrics,
  dragTrayToCell,
  emptyBoard,
  fillRowExcept,
  filledTrayCount,
  formatScore,
  makeSave,
  openFresh,
  readBest,
  readSave,
  seedAndOpen,
  waitForFilledTray,
} from "./helpers";

test.describe("A+B launch + play (Pixel 7a)", () => {
  test("7. first load: how-to-play before play; Start on the same screen", async ({ page }) => {
    await openFresh(page);
    await expect(page.getByTestId("overlay")).toBeVisible();
    await expect(page.getByTestId("howto")).toBeVisible();
    await expect(page.getByTestId("howto").locator("li")).toHaveCount(3);
    await expect(page.getByTestId("start")).toBeVisible();
    await expect(page.getByTestId("start-panel")).toBeVisible();
    await expect(page.getByTestId("tray")).toHaveCount(0);
    await expect(page.getByTestId("hud")).toHaveCount(0);
    const howtoBox = await page.getByTestId("howto").boundingBox();
    const startBox = await page.getByTestId("start").boundingBox();
    expect(howtoBox && startBox).toBeTruthy();
    expect(startBox!.y).toBeGreaterThan(howtoBox!.y);
  });

  test("8. version ID visible on launch and HUD", async ({ page }) => {
    await openFresh(page);
    const chip = page.getByTestId("version");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/v1\.\d+\.\d+/);
    await expect(page.getByTestId("start-version")).toHaveText(/v1\.\d+\.\d+/);

    await page.getByTestId("start").click();
    await expect(page.getByTestId("hud")).toBeVisible();
    await expect(page.getByTestId("version")).toBeVisible();
    await expect(page.getByTestId("version")).toHaveText(/v1\.\d+\.\d+/);
    await expect(page.getByTestId("footer-version")).toBeVisible();
    await expect(page.getByTestId("footer-version")).toHaveText(/v1\.\d+\.\d+/);
  });

  test("9. Best is shown; beating it updates without refresh and survives reload", async ({
    page,
  }) => {
    const board = emptyBoard();
    fillRowExcept(board, 9, 0, 2);
    const priorBest = 5;
    await seedAndOpen(
      page,
      makeSave({
        board,
        tray: [MONO, SQUARE, VERT_DOMINO],
        score: 5,
        best: priorBest,
      }),
      priorBest,
    );

    await expect(page.getByTestId("best")).toHaveText(`Best ${formatScore(priorBest)}`);
    expect(await readBest(page)).toBe(priorBest);

    await dragTrayToCell(page, 0, 9, 0);

    const expectedBest = 5 + 1 + 10;
    await expect(page.getByTestId("best")).toHaveText(`Best ${formatScore(expectedBest)}`);
    await expect(page.getByTestId("score")).toHaveText(formatScore(expectedBest));
    await expect.poll(async () => readBest(page)).toBe(expectedBest);

    await page.reload();
    await expect(page.getByTestId("hud")).toBeVisible();
    await expect(page.getByTestId("best")).toHaveText(`Best ${formatScore(expectedBest)}`);
    expect(await readBest(page)).toBe(expectedBest);
  });

  test("10. place a piece, clear a line, tray refills while still playable", async ({ page }) => {
    const board = emptyBoard();
    fillRowExcept(board, 9, 0, 2);
    await seedAndOpen(
      page,
      makeSave({
        board,
        tray: [MONO, null, null],
        score: 8,
        best: 8,
      }),
    );

    await expect(page.getByTestId("tray-slot-0").locator(".mini-piece")).toBeVisible();
    await expect(page.getByTestId("tray-slot-1").locator(".mini-piece")).toHaveCount(0);
    await expect(page.getByTestId("tray-slot-2").locator(".mini-piece")).toHaveCount(0);

    await dragTrayToCell(page, 0, 9, 0);

    await expect
      .poll(async () => {
        const save = await readSave(page);
        return save?.board[9].every((v) => v === 0);
      })
      .toBe(true);

    await waitForFilledTray(page, 3);
    expect(await filledTrayCount(page)).toBe(3);
    await expect(page.getByTestId("score")).not.toHaveText("8");
  });

  test("11a. Sunilown: clear 1 row → blocks above drop exactly +1", async ({ page }) => {
    const one = emptyBoard();
    fillRowExcept(one, 9, 0, 2);
    one[6][3] = 8;
    await seedAndOpen(
      page,
      makeSave({
        board: one,
        tray: [MONO, SQUARE, VERT_DOMINO],
        score: 6,
        best: 6,
      }),
    );

    await dragTrayToCell(page, 0, 9, 0);
    await expect
      .poll(async () => {
        const save = await readSave(page);
        return save?.board[7][3] === 8 && save.board[6][3] === 0;
      })
      .toBe(true);
  });

  test("11b. Sunilown: clear 2 rows → blocks above drop exactly +2", async ({ page }) => {
    const two = emptyBoard();
    fillRowExcept(two, 8, 0, 2);
    fillRowExcept(two, 9, 0, 2);
    two[5][4] = 7;
    await seedAndOpen(
      page,
      makeSave({
        board: two,
        tray: [VERT_DOMINO, MONO, SQUARE],
        score: 6,
        best: 6,
      }),
    );

    await dragTrayToCell(page, 0, 8, 0);
    await expect
      .poll(async () => {
        const save = await readSave(page);
        return save?.board[7][4] === 7 && save.board[5][4] === 0 && save.board[6][4] === 0;
      })
      .toBe(true);
  });

  test("12. undo / pause / new-game do not brick tray or score", async ({ page }) => {
    await seedAndOpen(
      page,
      makeSave({
        board: emptyBoard(),
        tray: [MONO, SQUARE, VERT_DOMINO],
        score: 10,
        best: 10,
      }),
    );

    await dragTrayToCell(page, 0, 0, 0);
    await expect(page.getByTestId("score")).toHaveText("11");
    await expect(page.getByTestId("undo")).toBeEnabled();
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("score")).toHaveText("10");
    await waitForFilledTray(page, 3);

    await page.getByTestId("pause").click();
    await expect(page.getByTestId("pause-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect(page.getByTestId("howto")).toBeVisible();
    await page.getByTestId("resume").click();
    await expect(page.getByTestId("tray")).toBeVisible();
    await expect(page.getByTestId("score")).toHaveText("10");
    await waitForFilledTray(page, 3);

    await page.getByTestId("pause").click();
    await page.getByTestId("new-game").click();
    await page.getByTestId("confirm-new").click();
    await expect(page.getByTestId("score")).toHaveText("0");
    await waitForFilledTray(page, 3);
    await expect(page.getByTestId("best")).toHaveText("Best 10");
  });

  test("13. hard refresh mid-game does not leave an empty tray", async ({ page }) => {
    await seedAndOpen(
      page,
      makeSave({
        board: emptyBoard(),
        tray: [MONO, SQUARE, I5_TALL],
        score: 15,
        best: 15,
      }),
    );
    await waitForFilledTray(page, 3);
    await page.reload();
    await expect(page.getByTestId("tray")).toBeVisible();
    await waitForFilledTray(page, 3);
    await expect(page.getByTestId("score")).toHaveText("15");
    expect(await filledTrayCount(page)).toBe(3);
  });
});

test.describe("C. Pixel 7a layout 412×915", () => {
  test.beforeEach(async ({ page }) => {
    await seedAndOpen(
      page,
      makeSave({
        board: emptyBoard(),
        tray: [I5_TALL, SQUARE, I5_WIDE],
        score: 12,
        best: 12,
      }),
    );
    await waitForFilledTray(page, 3);
  });

  test("14+15. full board + tray visible; no chrome clip; sane mid-gap", async ({ page }) => {
    const vp = page.viewportSize()!;
    expect(vp).toEqual({ width: 412, height: 915 });

    const hud = page.getByTestId("hud");
    const tray = page.getByTestId("tray");
    const wells = page.locator("[data-testid^='tray-slot-']");
    await expect(hud).toBeVisible();
    await expect(tray).toBeVisible();
    await expect(wells).toHaveCount(3);

    const hudBox = await hud.boundingBox();
    const trayBox = await tray.boundingBox();
    const m = await boardMetrics(page);
    expect(hudBox && trayBox).toBeTruthy();

    expect(hudBox!.y).toBeGreaterThanOrEqual(-1);
    expect(hudBox!.y + hudBox!.height).toBeLessThan(vp.height);
    expect(trayBox!.y).toBeGreaterThan(0);
    expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(vp.height + 1);

    const boardTop = m.boardY;
    const boardBottom = m.boardY + m.boardPx;
    expect(m.cell).toBeGreaterThanOrEqual(28);
    expect(m.boardPx).toBeGreaterThanOrEqual(280);
    expect(boardTop).toBeGreaterThanOrEqual(hudBox!.height - 8);
    expect(boardBottom).toBeLessThanOrEqual(trayBox!.y + 2);

    const midGap = trayBox!.y - boardBottom;
    expect(midGap, "mid-gap must be present (v1.1.22 over-tighten rejected)").toBeGreaterThanOrEqual(
      8,
    );
    expect(midGap, "do not require an over-tight stack").toBeLessThan(320);

    for (let i = 0; i < 3; i++) {
      const well = await page.getByTestId(`tray-slot-${i}`).boundingBox();
      expect(well).toBeTruthy();
      expect(well!.y).toBeGreaterThanOrEqual(0);
      expect(well!.y + well!.height).toBeLessThanOrEqual(vp.height + 1);
    }
  });

  test("16–19. tray contained; cell parity; 5-tall unclipped; square cells", async ({ page }) => {
    const m = await boardMetrics(page);
    const vp = page.viewportSize()!;

    const tall = await pieceMetrics(page, 0);
    const square = await pieceMetrics(page, 1);
    const wide = await pieceMetrics(page, 2);

    for (const piece of [tall, square, wide]) {
      expect(piece.well).toBeTruthy();
      expect(piece.box).toBeTruthy();
      expect(piece.box!.x).toBeGreaterThanOrEqual(piece.well!.x - 2);
      expect(piece.box!.y).toBeGreaterThanOrEqual(piece.well!.y - 2);
      expect(piece.box!.x + piece.box!.width).toBeLessThanOrEqual(piece.well!.x + piece.well!.width + 2);
      expect(piece.box!.y + piece.box!.height).toBeLessThanOrEqual(
        piece.well!.y + piece.well!.height + 2,
      );
      expect(Math.abs(piece.tileW - piece.tileH), "tray tiles must stay square").toBeLessThanOrEqual(
        1.5,
      );
    }

    expect(Math.abs(square.cell - m.cell), "2×2 tray cell must match the board").toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(tall.cell - m.cell), "5-tall bar must match the board cell").toBeLessThanOrEqual(
      2,
    );
    expect(tall.box!.height).toBeGreaterThanOrEqual(m.cell * 5 - 4);
    expect(tall.box!.y + tall.box!.height).toBeLessThanOrEqual(vp.height + 1);
    expect(wide.cell).toBeGreaterThan(4);
    expect(wide.tileW).toBeGreaterThan(4);
  });
});

async function pieceMetrics(page: import("@playwright/test").Page, slot: number) {
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
