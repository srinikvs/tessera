import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeLayout,
  trayFitCell,
  trayWellInnerSize,
  TRAY_WELL_CELLS,
} from "./render";

test("tray wells reserve 5 board cells so a vertical I-bar can match", () => {
  assert.equal(TRAY_WELL_CELLS, 5);
});

test("trayFitCell matches the board cell when the well can hold the piece", () => {
  assert.equal(trayFitCell(36, 2, 2, 110, 36 * TRAY_WELL_CELLS), 36);
  assert.equal(trayFitCell(36, 2, 1, 110, 36 * TRAY_WELL_CELLS), 36);
  assert.equal(trayFitCell(36, 1, 1, 110, 36 * TRAY_WELL_CELLS), 36);
  assert.equal(trayFitCell(36, 1, 5, 110, 36 * TRAY_WELL_CELLS), 36);
});

test("trayFitCell contain-fits a 5-wide bar that is wider than the well", () => {
  const fitted = trayFitCell(36, 5, 1, 110, 36 * TRAY_WELL_CELLS);
  assert.ok(fitted < 36);
  assert.equal(fitted, 110 / 5);
});

test("iPhone-width layout: 1–3 col tray cells equal the board cell", () => {
  // iPhone Safari CSS viewport (~390×844) with HUD + HTML tray insets.
  const layout = computeLayout(390, 844, { top: 58, bottom: 104 });
  const { innerW, innerH } = trayWellInnerSize(390, 16, layout.cell);
  assert.ok(layout.cell >= 28, `expected a usable board cell, got ${layout.cell}`);
  assert.equal(trayFitCell(layout.cell, 2, 2, innerW, innerH), layout.cell);
  assert.equal(trayFitCell(layout.cell, 2, 1, innerW, innerH), layout.cell);
  assert.equal(trayFitCell(layout.cell, 3, 2, innerW, innerH), layout.cell);
});

test("well inner width tracks dock width even when board cell is unchanged", () => {
  const cell = 36;
  const narrow = trayWellInnerSize(480, 16, cell);
  const wide = trayWellInnerSize(720, 16, cell);
  assert.equal(narrow.innerH, wide.innerH);
  assert.ok(wide.innerW > narrow.innerW);
  const fitNarrow = trayFitCell(cell, 5, 1, narrow.innerW, narrow.innerH);
  const fitWide = trayFitCell(cell, 5, 1, wide.innerW, wide.innerH);
  assert.ok(fitNarrow < cell, "5-wide bar contain-fits in a 480px dock");
  assert.ok(
    fitWide > fitNarrow,
    "same board cell, wider dock must refresh inline tray --cell",
  );
});

test("trayWellInnerSize content height is 5 board cells", () => {
  const cell = 36;
  const { innerH } = trayWellInnerSize(390, 16, cell);
  assert.equal(innerH, cell * TRAY_WELL_CELLS);
  const fitted = trayFitCell(cell, 1, 5, 110, innerH);
  assert.equal(fitted, cell);
  assert.ok(fitted * 5 <= innerH + 1e-9, "5-tall bar must not exceed the well");
});

test("iPhone-width layout: 5-tall bar matches the board cell", () => {
  const layout = computeLayout(390, 844, { top: 58, bottom: 104 });
  const { innerW, innerH } = trayWellInnerSize(390, 16, layout.cell);
  assert.ok(innerH >= layout.cell * 5);
  assert.equal(trayFitCell(layout.cell, 1, 5, innerW, innerH), layout.cell);
});

test("Pixel 7a layout: full board + 5-cell tray stay on-screen with a sane mid-gap", () => {
  const layout = computeLayout(412, 915, { top: 58, bottom: 104 });
  const boardBottom = layout.boardY + layout.boardPx;
  const trayTop = layout.slots[0].y;
  const midGap = trayTop - boardBottom;
  assert.ok(layout.cell >= 28, `expected a usable board cell, got ${layout.cell}`);
  assert.ok(layout.boardY >= 50, "board must sit below the HUD");
  assert.ok(midGap >= 8, `mid-gap must not over-tighten (rejected v1.1.22), got ${midGap}`);
  assert.ok(
    boardBottom + midGap + layout.slots[0].h <= 915,
    "tray reservation must stay inside the Pixel CSS viewport",
  );
  assert.equal(layout.slots[0].h, layout.cell * TRAY_WELL_CELLS);
});

test("Pixel-width layout: 5-tall bar matches the board cell", () => {
  const layout = computeLayout(412, 915, { top: 58, bottom: 104 });
  const { innerW, innerH } = trayWellInnerSize(412, 16, layout.cell);
  assert.ok(innerH >= layout.cell * 5);
  assert.equal(trayFitCell(layout.cell, 1, 5, innerW, innerH), layout.cell);
  assert.equal(trayFitCell(layout.cell, 2, 2, innerW, innerH), layout.cell);
});

test("legacy 18vw well would shrink a 2-row piece below the board cell", () => {
  const layout = computeLayout(390, 844, { top: 58, bottom: 104 });
  const oldWellH = 390 * 0.18 - 0.7 * 16;
  const shrunk = trayFitCell(layout.cell, 2, 2, 110, oldWellH);
  assert.ok(
    shrunk < layout.cell,
    `expected the old 18vw well to shrink 2-row tiles (board ${layout.cell}, tray ${shrunk})`,
  );
});
