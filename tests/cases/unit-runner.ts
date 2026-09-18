import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anyRemainingFits, applyClearWithGravity, applyLineClear, findFullLines, placeOn, scoreFor } from "../../src/game/logic.ts";
import { computeLayout, TRAY_WELL_CELLS } from "../../src/game/render.ts";
import { loadBest, loadSave, snapshotSave, writeBest, writeSave } from "../../src/game/save.ts";
import { pickShape } from "../../src/game/pieces.ts";
import { pieceOk, refillAfterPlace, trayHasPlaceable } from "../../src/game/tray.ts";
import { VERSION, VERSION_LABEL } from "../../src/version.ts";
import { buildBoard, emptyBoard, namedPiece, type BoardSpec, type PieceName, type TrayPiece } from "./fixtures.ts";
import type { CaseFile, Expectation, Step } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const mem = new Map<string, string>();

function ensureLocalStorage(): void {
  if (typeof (globalThis as { localStorage?: Storage }).localStorage?.getItem === "function") return;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, String(v));
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    },
  });
}

type Ctx = {
  board: number[][];
  tray: Array<TrayPiece | null>;
  lastBest: number | null;
};

function pieceList(names: PieceName[]): TrayPiece[] {
  return names.map((n, i) => namedPiece(n, i + 1));
}

function applyExpect(ctx: Ctx, exp: Expectation, caseId: string): void {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "scoreFor": {
      assert.equal(
        scoreFor(Number(exp.cells), Number(exp.lines), Number(exp.combo)),
        Number(exp.score),
        tag,
      );
      return;
    }
    case "sunilownExactDrop": {
      const nValues = (exp.nValues as number[]) ?? [1, 2, 3];
      const markerCols = (exp.markerCols as number[]) ?? [0, 3, 7, 9];
      for (const n of nValues) {
        const board = emptyBoard();
        const markers: Array<{ r: number; c: number; color: number }> = [];
        let color = 2;
        for (let r = 0; r < 10 - n; r++) {
          for (const c of markerCols) {
            if ((r + c) % 2 === 0) {
              board[r][c] = color;
              markers.push({ r, c, color });
              color = color === 9 ? 2 : color + 1;
            }
          }
        }
        for (let i = 0; i < n; i++) {
          for (let c = 0; c < 10; c++) board[10 - n + i][c] = 1;
        }
        const { rows } = findFullLines(board);
        assert.deepEqual(rows, Array.from({ length: n }, (_, i) => 10 - n + i), `${tag} rows N=${n}`);
        const next = applyClearWithGravity(board, rows, []);
        const expected = emptyBoard();
        for (const m of markers) expected[m.r + n][m.c] = m.color;
        assert.ok(markers.length > 0, `${tag} markers`);
        assert.deepEqual(
          next,
          expected,
          `${tag}: N=${n} every occupied cell above must drop exactly ${n} (no floaters, no under-drop)`,
        );
      }
      return;
    }
    case "anyRemainingFits": {
      const board = buildBoard(exp.board as BoardSpec);
      const tray = pieceList(exp.tray as PieceName[]);
      assert.equal(anyRemainingFits(board, tray), Boolean(exp.value), tag);
      return;
    }
    case "trayNotEmpty": {
      assert.ok(ctx.tray.some(pieceOk), tag);
      return;
    }
    case "trayEveryFilled": {
      assert.ok(ctx.tray.every(pieceOk), tag);
      return;
    }
    case "trayHasPlaceable": {
      assert.ok(trayHasPlaceable(ctx.board, ctx.tray), tag);
      return;
    }
    case "best": {
      assert.equal(loadBest(), Number(exp.value), tag);
      ctx.lastBest = loadBest();
      return;
    }
    case "saveScore": {
      assert.equal(loadSave()?.score, Number(exp.value), tag);
      return;
    }
    case "versionMatchesPackage": {
      const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
      assert.equal(VERSION, pkg.version, tag);
      assert.equal(VERSION_LABEL, `v${pkg.version}`, tag);
      return;
    }
    case "htmlHasVersionTag": {
      const html = readFileSync(join(ROOT, String(exp.file ?? "index.html")), "utf8");
      assert.match(html, new RegExp(`Tessera v${VERSION.replaceAll(".", "\\.")}`), tag);
      return;
    }
    case "uiUsesVersionLabel": {
      const src = readFileSync(join(ROOT, String(exp.file ?? "src/App.tsx")), "utf8");
      assert.match(src, /VERSION_LABEL/, tag);
      assert.doesNotMatch(src, /v1\.\d+\.\d+/, tag);
      return;
    }
    case "layout": {
      const width = Number(exp.width);
      const height = Number(exp.height);
      const layout = computeLayout(width, height, {
        top: Number(exp.top ?? 0),
        bottom: Number(exp.bottom ?? 0),
      });
      const boardBottom = layout.boardY + layout.boardPx;
      const midGap = layout.slots[0].y - boardBottom;
      if (exp.minCell != null) assert.ok(layout.cell >= Number(exp.minCell), `${tag} minCell ${layout.cell}`);
      if (exp.minBoardY != null) assert.ok(layout.boardY >= Number(exp.minBoardY), `${tag} boardY`);
      if (exp.minMidGap != null) {
        assert.ok(midGap >= Number(exp.minMidGap), `${tag} mid-gap must not over-tighten, got ${midGap}`);
      }
      if (exp.trayFitsViewport) {
        assert.ok(boardBottom + midGap + layout.slots[0].h <= height, `${tag} tray on-screen`);
      }
      if (exp.trayRows != null) {
        assert.equal(layout.slots[0].h, layout.cell * Number(exp.trayRows ?? TRAY_WELL_CELLS), `${tag} tray rows`);
      }
      return;
    }
    default:
      throw new Error(`${tag}: unknown unit assert "${exp.assert}"`);
  }
}

function runStep(ctx: Ctx, step: Step, c: CaseFile): void {
  const tag = `${c.id}/${step.op}`;
  switch (step.op) {
    case "scoreForTable":
    case "readVersionSources":
    case "sunilownNDrop":
    case "nop":
      return;
    case "expect":
      applyExpect(ctx, step as unknown as Expectation, c.id);
      return;
    case "clearAndRefill": {
      const kind = String(step.kind);
      let board = emptyBoard();
      const place = step.place as { piece: PieceName; row: number; col: number };
      if (kind === "row") {
        const exceptCol = Number(step.exceptCol ?? place.col);
        for (let col = 0; col < 10; col++) {
          if (col !== exceptCol) board[place.row][col] = 1;
        }
      } else if (kind === "col") {
        const exceptRow = Number(step.exceptRow ?? place.row);
        for (let row = 0; row < 10; row++) {
          if (row !== exceptRow) board[row][place.col] = 1;
        }
      } else {
        throw new Error(`${tag}: kind must be row | col`);
      }
      const last = namedPiece(place.piece, 1);
      let tray: Array<TrayPiece | null> = [last, null, null];
      const placed = placeOn(board, last, place.row, place.col);
      tray[0] = null;
      const { rows, cols } = findFullLines(placed);
      assert.ok(rows.length + cols.length > 0, `${tag}: expected a clear`);
      const cleared = applyLineClear(placed, rows, cols);
      const { tray: next } = refillAfterPlace(tray, cleared, { n: 20 }, (n) => pickShape(n), true);
      ctx.board = cleared;
      ctx.tray = next;
      return;
    }
    case "writeBest":
      ensureLocalStorage();
      localStorage.clear();
      writeBest(Number(step.value));
      ctx.lastBest = loadBest();
      return;
    case "writeSave": {
      ensureLocalStorage();
      if (step.reset) localStorage.clear();
      if (step.setupBest != null) writeBest(Number(step.setupBest));
      writeSave(
        snapshotSave({
          board: emptyBoard(),
          tray: [null, null, null],
          score: Number(step.score),
          combo: 0,
          best: Number(step.best),
          nextPieceId: 1,
          screen: "play",
        }),
      );
      ctx.lastBest = loadBest();
      return;
    }
    case "persistBest": {
      ensureLocalStorage();
      localStorage.clear();
      writeBest(Number(step.priorBest));
      writeSave(
        snapshotSave({
          board: emptyBoard(),
          tray: [null, null, null],
          score: Number(step.score),
          combo: 0,
          best: Number(step.priorBest),
          nextPieceId: 1,
          screen: "play",
        }),
      );
      ctx.lastBest = loadBest();
      return;
    }
    default:
      throw new Error(`${tag}: unknown unit op "${step.op}"`);
  }
}

export function runUnitCase(c: CaseFile): void {
  ensureLocalStorage();
  const ctx: Ctx = { board: emptyBoard(), tray: [null, null, null], lastBest: null };
  for (const step of c.steps) runStep(ctx, step, c);
  for (const exp of c.expect) applyExpect(ctx, exp, c.id);
}
