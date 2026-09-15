import { BOARD_SIZE, type Board, type Piece, type Shape } from "./types";
import { COLORS, DEAD, DEAD_HI, FRAME, GHOST_BAD, GHOST_OK, MUTED, WELL } from "./theme";

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

const WELL_INSET_X = 8;
const WELL_INSET_Y = 4;
const TRAY_PIECE_PAD = 6;

/**
 * Shared tray-height in board cells: HTML well (`trayWellInnerSize`) and
 * `computeLayout` reservation. 5 so a vertical I-bar matches the board cell.
 */
export const TRAY_WELL_CELLS = 5;

/** Dock/well chrome used by CSS and by `trayWellInnerSize` (keep in sync with styles.css). */
export const TRAY_DOCK_PAD_X_REM = 0.5;
export const TRAY_DOCK_GAP_REM = 0.35;
export const TRAY_WELL_PAD_REM = 0.25;
export const TRAY_WELL_BORDER_PX = 2.5;

export function trayWellInnerSize(
  dockW: number,
  rem: number,
  cell: number,
): { innerW: number; innerH: number } {
  const padX = TRAY_DOCK_PAD_X_REM * 2 * rem;
  const gaps = TRAY_DOCK_GAP_REM * 2 * rem;
  const wellPad = TRAY_WELL_PAD_REM * 2 * rem;
  return {
    innerW: Math.max(1, (dockW - padX - gaps) / 3 - wellPad - TRAY_WELL_BORDER_PX),
    // Content-box height matches the declared CSS well after padding+border
    // are added to `cell * rows` (see .tray-well height).
    innerH: Math.max(1, cell * TRAY_WELL_CELLS),
  };
}

/**
 * Tray grid step: board cell size when the piece fits the well, otherwise
 * contain-fit so a 5-wide bar still uses square cells inside the well.
 */
export function trayFitCell(
  boardCell: number,
  cols: number,
  rows: number,
  availW: number,
  availH: number,
): number {
  return Math.max(
    4,
    Math.min(boardCell, availW / Math.max(cols, 1), availH / Math.max(rows, 1)),
  );
}
