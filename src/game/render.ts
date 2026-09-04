import { BOARD_SIZE, type Board, type Piece, type Shape } from "./types";
import { CELL_WELL, COLORS, DEAD, DEAD_HI, FRAME, MUTED, WELL } from "./theme";

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

const TRAY_BAND = 112;
const WELL_INSET_X = 8;
const WELL_INSET_Y = 4;
const TRAY_PIECE_PAD = 6;

export function slotWell(slot: Layout["slots"][number]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: slot.x + WELL_INSET_X,
    y: slot.y + WELL_INSET_Y,
    w: Math.max(0, slot.w - WELL_INSET_X * 2),
    h: Math.max(0, slot.h - WELL_INSET_Y * 2),
  };
}

export function computeLayout(
  w: number,
  h: number,
  inset: { top?: number; bottom?: number } = {},
): Layout {
  const top = Math.max(0, inset.top ?? 0);
  const bottom = Math.max(0, inset.bottom ?? 0);
  const innerH = Math.max(1, h - top - bottom);
  const padX = Math.max(10, Math.round(w * 0.04));
  const wide = w >= 640;
  const gutter = wide ? 12 : 22;

  const maxCellW = Math.floor((w - padX * 2) / BOARD_SIZE);
  const maxCellH = Math.floor((innerH - gutter - TRAY_BAND) / BOARD_SIZE);
  const cell = Math.max(11, Math.min(56, maxCellW, maxCellH));
  const gap = cell >= 36 ? 3 : cell >= 28 ? 2 : 1.5;
  const boardPx = cell * BOARD_SIZE;
  const used = boardPx + gutter + TRAY_BAND;
  const slack = Math.max(0, innerH - used);
  const boardY = top + Math.floor(slack * (wide ? 0.28 : 0.5));
  const boardX = Math.round((w - boardPx) / 2);
  const slotY = boardY + boardPx + gutter;
  const maxSlotH = Math.max(8, h - bottom - slotY);
  const slotH = Math.max(8, Math.min(TRAY_BAND, maxSlotH));
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
  const well = slotWell(s);
  const { rows, cols } = pieceBounds(piece.cells);
  const availW = Math.max(1, well.w - TRAY_PIECE_PAD * 2);
  const availH = Math.max(1, well.h - TRAY_PIECE_PAD * 2);
  // Contain-fit square cells inside the well. Never larger than board cells
  // so the tray is a scaled-down preview; drag/ghost keep layout.cell.
  const cell = Math.max(
    4,
    Math.min(availW / Math.max(cols, 1), availH / Math.max(rows, 1), 22, layout.cell),
  );
  const pw = cols * cell;
  const ph = rows * cell;
  return {
    x: well.x + (well.w - pw) / 2,
    y: well.y + (well.h - ph) / 2,
    cell,
  };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  gray = false,
): void {
  const fill = gray ? DEAD : color;
  const hi = gray ? DEAD_HI : lighten(color, 0.18);
  const lo = gray ? "#4a4c54" : darken(color, 0.18);
  const r = Math.max(3, s * 0.18);
  ctx.beginPath();
  roundRect(ctx, x, y, s, s, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x + 1, y + 1, s - 2, s * 0.35, r * 0.6);
  ctx.fillStyle = hi;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = lo;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, r);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function lighten(hex: string, amount: number): string {
  return shade(hex, amount);
}

function darken(hex: string, amount: number): string {
  return shade(hex, -amount);
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amount)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amount)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amount)));
  return `rgb(${r},${g},${b})`;
}

export function drawBoardFrame(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const pad = 7;
  ctx.fillStyle = FRAME;
  ctx.beginPath();
  roundRect(
    ctx,
    layout.boardX - pad,
    layout.boardY - pad,
    layout.boardPx + pad * 2,
    layout.boardPx + pad * 2,
    16,
  );
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, layout.boardX, layout.boardY, layout.boardPx, layout.boardPx, 6);
  ctx.fillStyle = WELL;
  ctx.fill();
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  board: Board,
  popScale: Map<string, number>,
  clearing: { rows: Set<number>; cols: Set<number>; flash: number; scale: number } | null,
): void {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const { x, y, s } = cellRect(layout, r, c);
      ctx.fillStyle = CELL_WELL;
      ctx.beginPath();
      roundRect(ctx, x, y, s, s, Math.max(3, s * 0.18));
      ctx.fill();
      const v = board[r][c];
      if (!v) continue;
      const key = `${r},${c}`;
      const pop = popScale.get(key) ?? 1;
      let scale = pop;
      let alpha = 1;
      if (clearing && (clearing.rows.has(r) || clearing.cols.has(c))) {
        scale *= clearing.scale;
        alpha = Math.max(0.05, 1 - clearing.flash * 0.3);
        ctx.fillStyle = `rgba(255,255,255,${clearing.flash * 0.5})`;
        ctx.fillRect(x - 1, y - 1, s + 2, s + 2);
      }
      const cs = s * scale;
      const ox = x + (s - cs) / 2;
      const oy = y + (s - cs) / 2;
      ctx.globalAlpha = alpha;
      drawTile(ctx, ox, oy, cs, COLORS[(v - 1) % COLORS.length]);
      ctx.globalAlpha = 1;
    }
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  originX: number,
  originY: number,
  cell: number,
  gap: number,
  opts: { scale?: number; gray?: boolean; alpha?: number } = {},
): void {
  const scale = opts.scale ?? 1;
  const gray = opts.gray ?? false;
  const alpha = opts.alpha ?? 1;
  ctx.globalAlpha = alpha;
  for (const [dr, dc] of piece.cells) {
    const s = (cell - gap) * scale;
    const x = originX + dc * cell + (cell - s) / 2;
    const y = originY + dr * cell + (cell - s) / 2;
    drawTile(ctx, x, y, s, COLORS[(piece.color - 1) % COLORS.length], gray);
  }
  ctx.globalAlpha = 1;
}

export function drawTraySlots(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  tray: Array<Piece | null>,
  activeSlot: number | null,
  fits: boolean[],
): void {
  for (let i = 0; i < 3; i++) {
    const s = layout.slots[i];
    const well = slotWell(s);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    roundRect(ctx, well.x, well.y, well.w, well.h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(242,241,238,0.18)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    const piece = tray[i];
    if (!piece || activeSlot === i) continue;
    const rect = trayPieceRect(layout, i, piece);
    const gray = fits[i] === false;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, well.x, well.y, well.w, well.h, 12);
    ctx.clip();
    drawPiece(ctx, piece, rect.x, rect.y, rect.cell, Math.max(1, rect.cell * 0.08), {
      gray,
      alpha: gray ? 0.85 : 1,
    });
    ctx.restore();
  }
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  piece: Piece,
  row: number,
  col: number,
  ok: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = ok ? 0.5 : 0.38;
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) continue;
    const { x, y, s } = cellRect(layout, r, c);
    drawTile(ctx, x, y, s, COLORS[(piece.color - 1) % COLORS.length], !ok);
  }
  ctx.restore();
}

export function drawLinePreview(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  rows: number[],
  cols: number[],
): void {
  ctx.fillStyle = "rgba(242,241,238,0.12)";
  for (const r of rows) {
    ctx.fillRect(layout.boardX, layout.boardY + r * layout.cell, layout.boardPx, layout.cell);
  }
  for (const c of cols) {
    ctx.fillRect(layout.boardX + c * layout.cell, layout.boardY, layout.cell, layout.boardPx);
  }
}

export function drawDragPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  px: number,
  py: number,
  grabR: number,
  grabC: number,
  cell: number,
  gap: number,
  gray = false,
): void {
  const originX = px - (grabC + 0.5) * cell;
  const originY = py - (grabR + 0.5) * cell;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawPiece(ctx, piece, originX, originY, cell, gap, {
    scale: 1.04,
    gray,
    alpha: gray ? 0.7 : 1,
  });
  ctx.restore();
}

export function hitTrayPiece(
  layout: Layout,
  tray: Array<Piece | null>,
  x: number,
  y: number,
): { slot: number; grabR: number; grabC: number } | null {
  for (let i = 0; i < 3; i++) {
    const piece = tray[i];
    if (!piece) continue;
    const rect = trayPieceRect(layout, i, piece);
    for (const [dr, dc] of piece.cells) {
      const tx = rect.x + dc * rect.cell;
      const ty = rect.y + dr * rect.cell;
      if (x >= tx && x < tx + rect.cell && y >= ty && y < ty + rect.cell) {
        return { slot: i, grabR: dr, grabC: dc };
      }
    }
    const s = layout.slots[i];
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) {
      return { slot: i, grabR: 0, grabC: 0 };
    }
  }
  return null;
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFloaters(ctx: CanvasRenderingContext2D, floaters: Floater[]): void {
  for (const f of floaters) {
    const a = 1 - f.t / 0.9;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = f.color;
    ctx.font = "600 16px Outfit, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y - f.t * 40);
  }
  ctx.globalAlpha = 1;
}

export function drawCombo(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  text: string,
  t: number,
): void {
  const a = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.6) / 0.55);
  ctx.globalAlpha = a;
  ctx.fillStyle = MUTED;
  ctx.font = "600 22px Fraunces, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(text, layout.boardX + layout.boardPx / 2, layout.boardY - 18);
  ctx.globalAlpha = 1;
}
