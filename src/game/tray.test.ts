import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLineClear, emptyBoard, findFullLines, placeOn } from "./logic";
import { pickShape } from "./pieces";
import {
  ensureTrayNotEmpty,
  pieceOk,
  refillAfterClear,
  refillAfterPlace,
  trayHasPlaceable,
} from "./tray";
import type { Board, Piece } from "./types";

function dealSeq(shapes: Piece[]): (id: { n: number }) => Piece {
  let i = 0;
  return (id) => {
    const src = shapes[Math.min(i, shapes.length - 1)];
    i++;
    return { id: id.n++, color: src.color, cells: src.cells.map(([r, c]) => [r, c] as [number, number]) };
  };
}

const MONO: Piece = { id: 0, color: 1, cells: [[0, 0]] };
const DOMINO: Piece = {
  id: 0,
  color: 2,
  cells: [
    [0, 0],
    [0, 1],
  ],
};
const BAR: Piece = {
  id: 0,
  color: 3,
  cells: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
};

function fillRow(board: Board, row: number, exceptCol = -1): void {
  for (let c = 0; c < 10; c++) {
    if (c !== exceptCol) board[row][c] = 1;
  }
}

test("refillAfterClear keeps leftovers and fills empty wells", () => {
  const board = emptyBoard();
  const leftover = { ...DOMINO, id: 7 };
  const tray: Array<Piece | null> = [null, leftover, null];
  const id = { n: 10 };
  const { tray: next, filled } = refillAfterClear(tray, board, id, dealSeq([MONO, MONO, MONO]));
  assert.equal(filled, 2);
  assert.ok(pieceOk(next[0]));
  assert.equal(next[1]?.id, 7);
  assert.ok(pieceOk(next[2]));
  assert.ok(next.every(pieceOk));
});

test("refillAfterClear deals a new trio when the tray is empty", () => {
  const board = emptyBoard();
  const id = { n: 1 };
  const { tray: next, filled } = refillAfterClear([null, null, null], board, id, dealSeq([MONO, DOMINO, BAR]));
  assert.equal(filled, 3);
  assert.ok(next.every(pieceOk));
  assert.ok(trayHasPlaceable(board, next));
});

test("refillAfterPlace without a clear does not fill leftover holes", () => {
  const board = emptyBoard();
  const leftover = { ...DOMINO, id: 3 };
  const { tray: next, filled } = refillAfterPlace([null, leftover, leftover], board, { n: 1 }, dealSeq([MONO]), false);
  assert.equal(filled, 0);
  assert.equal(next[0], null);
  assert.equal(next[1]?.id, 3);
});

test("refillAfterPlace with a clear fills holes", () => {
  const board = emptyBoard();
  const leftover = { ...DOMINO, id: 3 };
  const { tray: next, filled } = refillAfterPlace([null, leftover, null], board, { n: 1 }, dealSeq([MONO, MONO]), true);
  assert.equal(filled, 2);
  assert.ok(next.every(pieceOk));
  assert.equal(next[1]?.id, 3);
});

test("spent trio (all null) always deals, even without a clear", () => {
  const { tray: next, filled } = refillAfterPlace([null, null, null], emptyBoard(), { n: 1 }, dealSeq([MONO, MONO, MONO]), false);
  assert.equal(filled, 3);
  assert.ok(next.every(pieceOk));
});

test("line-clear cycle: place last piece, clear, tray is never empty", () => {
  const board = emptyBoard();
  fillRow(board, 0, 0);
  const last: Piece = { id: 1, color: 4, cells: [[0, 0]] };
  let tray: Array<Piece | null> = [last, null, null];
  const placed = placeOn(board, last, 0, 0);
  tray[0] = null;
  const { rows, cols } = findFullLines(placed);
  assert.ok(rows.length + cols.length > 0);
  const cleared = applyLineClear(placed, rows, cols);
  const id = { n: 20 };
  const { tray: next } = refillAfterPlace(tray, cleared, id, (n) => pickShape(n), true);
  assert.ok(next.every(pieceOk), "tray must have three pieces after a clear");
  assert.ok(trayHasPlaceable(cleared, next));
});

test("multiple clears in a session never leave the tray empty", () => {
  let board = emptyBoard();
  const id = { n: 1 };
  let tray: Array<Piece | null> = [null, null, null];
  tray = refillAfterPlace(tray, board, id, (n) => pickShape(n), false).tray;

  for (let round = 0; round < 8; round++) {
    fillRow(board, round % 10, 0);
    const slot = tray.findIndex(pieceOk);
    assert.ok(slot >= 0, `round ${round}: tray had no piece to place`);
    const piece = tray[slot]!;
    // Force a 1-cell so the row always clears.
    const mono: Piece = { id: piece.id, color: piece.color, cells: [[0, 0]] };
    board = placeOn(board, mono, round % 10, 0);
    tray[slot] = null;
    const lines = findFullLines(board);
    assert.ok(lines.rows.length + lines.cols.length > 0);
    board = applyLineClear(board, lines.rows, lines.cols);
    tray = refillAfterPlace(tray, board, id, (n) => pickShape(n), true).tray;
    assert.ok(
      tray.some(pieceOk),
      `round ${round}: tray empty after line clear (score-like session)`,
    );
    assert.ok(trayHasPlaceable(board, tray));
  }
});

test("ensureTrayNotEmpty heals an all-null playable tray", () => {
  const { tray: next, filled } = ensureTrayNotEmpty([null, null, null], emptyBoard(), { n: 1 }, dealSeq([MONO, MONO, MONO]), false);
  assert.equal(filled, 3);
  assert.ok(next.every(pieceOk));
});

test("ensureTrayNotEmpty with fillHoles fills leftover empty wells", () => {
  const leftover = { ...BAR, id: 9 };
  const { tray: next } = ensureTrayNotEmpty([null, leftover, null], emptyBoard(), { n: 1 }, dealSeq([MONO, MONO]), true);
  assert.ok(next.every(pieceOk));
  assert.equal(next[1]?.id, 9);
});
