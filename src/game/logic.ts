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

export function applyLineClear(board: Board, rows: number[], cols: number[]): Board {
  const next = cloneBoard(board);
  const rowSet = new Set(rows);
  const colSet = new Set(cols);
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (rowSet.has(r) || colSet.has(c)) next[r][c] = 0;
    }
  }
  return next;
}

/**
 * Sunilown: remaining rows fall by the number of cleared rows beneath them.
 * Whole rows move (Tetris gravity). Holes inside a row stay holes.
 */
export function applyRowGravity(board: Board, clearedRows: number[]): Board {
  if (clearedRows.length === 0) return cloneBoard(board);
  const gone = new Set(clearedRows);
  const kept: number[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (!gone.has(r)) kept.push(board[r].slice());
  }
  const next = emptyBoard();
  const offset = BOARD_SIZE - kept.length;
  for (let i = 0; i < kept.length; i++) next[offset + i] = kept[i];
  return next;
}

export function applyClearWithGravity(board: Board, rows: number[], cols: number[]): Board {
  const cleared = applyLineClear(board, rows, cols);
  if (rows.length === 0) return cleared;
  return applyRowGravity(cleared, rows);
}

/** Clear lines, apply Sunilown gravity, repeat until no full rows/cols remain. */
export function settleSunilown(board: Board): {
  board: Board;
  waves: Array<{ rows: number[]; cols: number[] }>;
} {
  let cur = cloneBoard(board);
  const waves: Array<{ rows: number[]; cols: number[] }> = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { rows, cols } = findFullLines(cur);
    if (rows.length === 0 && cols.length === 0) break;
    waves.push({ rows, cols });
    cur = applyClearWithGravity(cur, rows, cols);
  }
  return { board: cur, waves };
}

export function anyRemainingFits(board: Board, tray: Array<Piece | null>): boolean {
  const remaining = tray.filter((p): p is Piece => p !== null);
  if (remaining.length === 0) return true;
  return remaining.some((p) => anyFit(board, p));
}

export function hasProgress(board: Board, score: number): boolean {
  if (score > 0) return true;
  return board.some((row) => row.some((v) => v !== 0));
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
