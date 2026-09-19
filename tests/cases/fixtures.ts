export type PieceName = "mono" | "vertDomino" | "bar5" | "i5Tall" | "i5Wide" | "square";

export type TrayPiece = {
  cells: Array<[number, number]>;
  color: number;
  id: number;
};

export type BoardSpec = {
  preset?: "empty" | "full" | "oneHole";
  fillRowExcept?: Array<{ row: number; exceptCol: number; color?: number }>;
  fillColExcept?: Array<{ col: number; exceptRow: number; color?: number }>;
  cells?: Array<[number, number, number]>;
};

export const PIECES: Record<PieceName, TrayPiece> = {
  mono: { cells: [[0, 0]], color: 4, id: 1 },
  vertDomino: {
    cells: [
      [0, 0],
      [1, 0],
    ],
    color: 5,
    id: 2,
  },
  bar5: {
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    color: 1,
    id: 6,
  },
  i5Tall: {
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ],
    color: 3,
    id: 3,
  },
  i5Wide: {
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    color: 6,
    id: 4,
  },
  square: {
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    color: 2,
    id: 5,
  },
};

export function emptyBoard(): number[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(0));
}

export function namedPiece(name: PieceName, id = PIECES[name].id): TrayPiece {
  const src = PIECES[name];
  if (!src) throw new Error(`unknown piece "${name}"`);
  return { cells: src.cells.map(([r, c]) => [r, c] as [number, number]), color: src.color, id };
}

export function resolveTray(names: Array<PieceName | null>): Array<TrayPiece | null> {
  return names.map((n, i) => (n ? namedPiece(n, 10 + i) : null));
}

export function buildBoard(spec?: BoardSpec): number[][] {
  const board = emptyBoard();
  if (!spec) return board;
  if (spec.preset === "full") {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) board[r][c] = 1;
    return board;
  }
  if (spec.preset === "oneHole") {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!(r === 0 && c === 0)) board[r][c] = 1;
      }
    }
    return board;
  }
  for (const row of spec.fillRowExcept ?? []) {
    for (let c = 0; c < 10; c++) {
      if (c !== row.exceptCol) board[row.row][c] = row.color ?? 2;
    }
  }
  for (const col of spec.fillColExcept ?? []) {
    for (let r = 0; r < 10; r++) {
      if (r !== col.exceptRow) board[r][col.col] = col.color ?? 2;
    }
  }
  for (const [r, c, color] of spec.cells ?? []) board[r][c] = color;
  return board;
}
