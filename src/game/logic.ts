import { BOARD_SIZE, type Board, type Piece } from "./types";

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
    if (board[r][c] !== 0) return false;
  }
  return true;
}

export function placeOn(board: Board, piece: Piece, row: number, col: number): Board {
  const next = cloneBoard(board);
  for (const [dr, dc] of piece.cells) {
    next[row + dr][col + dc] = piece.color;
  }
  return next;
}

export function findFullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every((v) => v !== 0)) rows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r][c] === 0) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  return { rows, cols };
}

export function anyFit(board: Board, piece: Piece): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (canPlace(board, piece, r, c)) return true;
    }
  }
  return false;
}

export function anyRemainingFits(board: Board, tray: Array<Piece | null>): boolean {
  for (const p of tray) {
    if (p && anyFit(board, p)) return true;
  }
  return false;
}

export function scoreFor(cells: number, lines: number, combo: number): number {
  const place = cells;
  const lineScore = lines > 0 ? 10 * lines * combo : 0;
  return place + lineScore;
}

export function comboLabel(lines: number, combo: number): string | null {
  if (lines >= 3) return "Clear!";
  if (combo >= 3) return `Combo ×${combo}`;
  if (lines >= 2) return "Nice";
  return null;
}
