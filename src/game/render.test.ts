import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeLayout,
  trayFitCell,
  trayWellInnerSize,
  TRAY_WELL_BORDER_PX,
  TRAY_WELL_CELLS,
} from "./render";

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

test("trayWellInnerSize uses the well content-box height, not border-box", () => {
  const cell = 36;
  const { innerH } = trayWellInnerSize(390, 16, cell);
  assert.equal(innerH, cell * TRAY_WELL_CELLS - TRAY_WELL_BORDER_PX);
  // A 5-tall bar must fit the content box; using cell*4 would clip by the border.
  const fitted = trayFitCell(cell, 1, 5, 110, innerH);
  assert.ok(fitted * 5 <= innerH + 1e-9);
  assert.equal(fitted, innerH / 5);
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
