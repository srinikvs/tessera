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

export function computeLayout(
  w: number,
  h: number,
  inset: { top?: number; bottom?: number } = {},
): Layout {
  const top = Math.max(0, inset.top ?? 0);
  const bottom = Math.max(0, inset.bottom ?? 0);
  const innerH = Math.max(1, h - top - bottom);
  const padX = Math.max(8, Math.round(w * 0.04));

  const trayMin = Math.min(112, Math.max(72, Math.round(innerH * 0.28)));
  const trayH = Math.min(Math.max(trayMin, 88), Math.floor(innerH * 0.42));
  const boardBudget = Math.max(80, innerH - trayH);
  const maxCell = Math.floor(Math.min(w - padX * 2, boardBudget - 6) / BOARD_SIZE);
  const cell = Math.max(12, Math.min(56, maxCell));
  const boardPx = cell * BOARD_SIZE;
  const boardX = Math.round((w - boardPx) / 2);
  const boardY = top + Math.max(0, Math.round((boardBudget - boardPx) / 2));
  const gap = cell >= 36 ? 3 : cell >= 28 ? 2 : 1.5;

  const slotW = w / 3;
  const slotY = top + boardBudget + 2;
  const slotH = Math.max(56, Math.min(h - bottom - slotY - 2, trayH - 4));
  const scale = slotH < 80 || w < 420 ? 0.78 : 0.7;
  const slots = [0, 1, 2].map((i) => ({
    x: i * slotW,
    y: slotY,
    w: slotW,
    h: Math.max(52, slotH),
    scale,
  }));

  return { w, h, cell, gap, boardX, boardY, boardPx, slots };
}
