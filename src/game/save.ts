import { emptyBoard } from "./logic";
import type { Board, Piece, Screen } from "./types";

const KEY = "tessera-save-v1";
const BEST = "tessera-best-v1";
const MUTED = "tessera-muted-v1";
const HINT = "tessera-hint-v1";

export interface SaveData {
  board: Board;
  tray: Array<{ cells: Array<[number, number]>; color: number; id: number } | null>;
  score: number;
  combo: number;
  best: number;
  nextPieceId: number;
  screen: Screen;
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST) || 0) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(n: number): void {
  try {
    localStorage.setItem(BEST, String(n));
  } catch {
    /* ignore */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTED, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
}

export function writeHintSeen(): void {
  try {
    localStorage.setItem(HINT, "1");
  } catch {
    /* ignore */
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveData;
    if (!Array.isArray(s.board) || s.board.length !== 10) s.board = emptyBoard();
    return s;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    writeBest(Math.max(data.best, data.score));
  } catch {
    /* ignore */
  }
}

export function snapshotSave(args: {
  board: Board;
  tray: Array<Piece | null>;
  score: number;
  combo: number;
  best: number;
  nextPieceId: number;
  screen: Screen;
}): SaveData {
  return {
    board: args.board.map((r) => r.slice()),
    tray: args.tray.map((p) =>
      p ? { cells: p.cells.map(([a, b]) => [a, b] as [number, number]), color: p.color, id: p.id } : null,
    ),
    score: args.score,
    combo: args.combo,
    best: args.best,
    nextPieceId: args.nextPieceId,
    screen: args.screen,
  };
}

export function trayFromSave(
  tray: SaveData["tray"],
  nextId: { n: number },
): Array<Piece | null> {
  return tray.map((p) => {
    if (!p) return null;
    nextId.n = Math.max(nextId.n, p.id + 1);
    return { id: p.id, cells: p.cells, color: p.color };
  });
}
