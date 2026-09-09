import { anyFit } from "./logic";
import type { Board, Piece } from "./types";

export type DealFn = (nextId: { n: number }) => Piece;

export function pieceOk(p: Piece | null | undefined): p is Piece {
  return !!p && Array.isArray(p.cells) && p.cells.length > 0;
}

export function padTray(tray: Array<Piece | null> | null | undefined): Array<Piece | null> {
  const next = Array.isArray(tray) ? tray.slice(0, 3) : [];
  while (next.length < 3) next.push(null);
  return next;
}

export function dealFittingPiece(board: Board, nextId: { n: number }, deal: DealFn): Piece {
  for (let i = 0; i < 48; i++) {
    const p = deal(nextId);
    try {
      if (anyFit(board, p)) return p;
    } catch {
      /* try another */
    }
  }
  const mono: Piece = { id: nextId.n++, color: 1, cells: [[0, 0]] };
  try {
    if (anyFit(board, mono)) return mono;
  } catch {
    /* board may be full */
  }
  return mono;
}

export function trayHasPlaceable(board: Board, tray: Array<Piece | null>): boolean {
  try {
    return padTray(tray).some((p) => pieceOk(p) && anyFit(board, p));
  } catch {
    return false;
  }
}

/**
 * After a line clear: leftovers stay; empty wells get a placeable piece.
 * All-empty deals a new trio. Never returns a fully empty tray.
 */
export function refillAfterClear(
  tray: Array<Piece | null>,
  board: Board,
  nextId: { n: number },
  deal: DealFn,
): { tray: Array<Piece | null>; filled: number } {
  const next = padTray(tray).map((p) => (pieceOk(p) ? p : null));
  const emptyIdx: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (!pieceOk(next[i])) emptyIdx.push(i);
  }

  if (emptyIdx.length === 3) {
    next[0] = dealFittingPiece(board, nextId, deal);
    next[1] = dealFittingPiece(board, nextId, deal);
    next[2] = dealFittingPiece(board, nextId, deal);
    return { tray: next, filled: 3 };
  }

  for (const i of emptyIdx) {
    next[i] = dealFittingPiece(board, nextId, deal);
  }

  if (!trayHasPlaceable(board, next) && emptyIdx.length > 0) {
    for (const i of emptyIdx) {
      next[i] = dealFittingPiece(board, nextId, deal);
    }
  }

  return { tray: next, filled: emptyIdx.length };
}

/**
 * After a place with no line clear: empty wells stay empty until the trio
 * is spent. All-empty (spent trio) deals a new set.
 */
export function refillAfterPlace(
  tray: Array<Piece | null>,
  board: Board,
  nextId: { n: number },
  deal: DealFn,
  didClear: boolean,
): { tray: Array<Piece | null>; filled: number } {
  const padded = padTray(tray).map((p) => (pieceOk(p) ? p : null));
  if (didClear || padded.every((p) => p === null)) {
    return refillAfterClear(padded, board, nextId, deal);
  }
  return { tray: padded, filled: 0 };
}

/** Playable round invariant: never all-null while the game is not over. */
export function ensureTrayNotEmpty(
  tray: Array<Piece | null>,
  board: Board,
  nextId: { n: number },
  deal: DealFn,
  fillHoles: boolean,
): { tray: Array<Piece | null>; filled: number } {
  const padded = padTray(tray).map((p) => (pieceOk(p) ? p : null));
  if (padded.every((p) => p === null) || fillHoles) {
    return refillAfterClear(padded, board, nextId, deal);
  }
  return { tray: padded, filled: 0 };
}
