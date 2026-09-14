import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLayout, trayFitCell, TRAY_WELL_CELLS } from "./render";

test("trayFitCell matches the board cell when the well can hold the piece", () => {
  assert.equal(trayFitCell(36, 2, 2, 110, 36 * TRAY_WELL_CELLS), 36);
  assert.equal(trayFitCell(36, 2, 1, 110, 36 * TRAY_WELL_CELLS), 36);
  assert.equal(trayFitCell(36, 1, 1, 110, 36 * TRAY_WELL_CELLS), 36);
});

test("trayFitCell contain-fits a 5-wide bar that is wider than the well", () => {
  const fitted = trayFitCell(36, 5, 1, 110, 36 * TRAY_WELL_CELLS);
  assert.ok(fitted < 36);
  assert.equal(fitted, 110 / 5);
});

test("iPhone-width layout: 2-row tray cell equals board cell", () => {
  // iPhone Safari CSS viewport (~390×844) with HUD + HTML tray insets.
  const layout = computeLayout(390, 844, { top: 58, bottom: 104 });
  const wellW = (390 - 2.5 * 16) / 3 - 0.7 * 16;
  const wellH = layout.cell * TRAY_WELL_CELLS;
  const twoByTwo = trayFitCell(layout.cell, 2, 2, wellW, wellH);
  const domino = trayFitCell(layout.cell, 2, 1, wellW, wellH);
  assert.ok(layout.cell >= 28, `expected a usable board cell, got ${layout.cell}`);
  assert.equal(twoByTwo, layout.cell);
  assert.equal(domino, layout.cell);
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
