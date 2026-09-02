import { BOARD_SIZE, type Board, type Piece, type Shape } from "./types";
import { COLORS, DEAD, DEAD_HI, GHOST_BAD, GHOST_OK, MUTED, SURFACE, WELL } from "./theme";

export interface Layout {
  w: number;
  h: number;
  cell: number;
  gap: number;
  boardX: number;
  boardY: number;
  boardPx: number;
  slots: Array<{ x: number; y: number; w: number; h: number; scale: number }>;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Floater {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

const TRAY_UNITS = 4;

export function computeLayout(
  w: number,
  h: number,
  inset: { top?: number; bottom?: number } = {},
): Layout {
  const top = Math.max(0, inset.top ?? 0);
  const bottom = Math.max(0, inset.bottom ?? 0);
  const innerH = Math.max(1, h - top - bottom);
  const padX = Math.max(8, Math.round(w * 0.03));
  const gutter = 8;

  const maxCellW = Math.floor((w - padX * 2) / BOARD_SIZE);
  const maxCellH = Math.floor((innerH - gutter) / (BOARD_SIZE + TRAY_UNITS));
  const cell = Math.max(11, Math.min(56, maxCellW, maxCellH));
  const gap = cell >= 36 ? 3 : cell >= 28 ? 2 : 1.5;
  const boardPx = cell * BOARD_SIZE;
  const trayH = cell * TRAY_UNITS;
  const used = boardPx + gutter + trayH;
  const slack = Math.max(0, innerH - used);
  const boardY = top + Math.floor(slack * 0.35);
  const boardX = Math.round((w - boardPx) / 2);
  const slotY = boardY + boardPx + gutter;
  const slotH = Math.max(cell * 2, Math.min(trayH, h - bottom - slotY));
  const slotW = w / 3;
  const slots = [0, 1, 2].map((i) => ({
    x: i * slotW,
    y: slotY,
    w: slotW,
    h: slotH,
    scale: 1,
  }));

  return { w, h, cell, gap, boardX, boardY, boardPx, slots };
}

export function cellRect(layout: Layout, r: number, c: number): { x: number; y: number; s: number } {
  const s = layout.cell - layout.gap;
  return {
    x: layout.boardX + c * layout.cell + layout.gap / 2,
    y: layout.boardY + r * layout.cell + layout.gap / 2,
    s,
  };
}

export function pointerToCell(
  layout: Layout,
  x: number,
  y: number,
): { r: number; c: number } {
  const c = Math.floor((x - layout.boardX) / layout.cell);
  const r = Math.floor((y - layout.boardY) / layout.cell);
  return { r, c };
}

function pieceBounds(cells: Shape): { rows: number; cols: number } {
  let maxR = 0;
  let maxC = 0;
  for (const [r, c] of cells) {
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }
  return { rows: maxR + 1, cols: maxC + 1 };
}

export function trayPieceRect(
  layout: Layout,
  slot: number,
  piece: Piece,
): { x: number; y: number; cell: number } {
  const s = layout.slots[slot];
  const { rows, cols } = pieceBounds(piece.cells);
  const cell = layout.cell;
  const pw = cols * cell;
  const ph = rows * cell;
  return {
    x: s.x + (s.w - pw) / 2,
    y: s.y + Math.max(0, (s.h - ph) / 2),
    cell,
  };
}
