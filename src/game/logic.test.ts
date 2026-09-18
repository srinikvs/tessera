import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anyRemainingFits,
  applyClearWithGravity,
  emptyBoard,
  findFullLines,
  placeOn,
  scoreFor,
  settleSunilown,
} from "./logic";
import type { Board, Piece } from "./types";

const MONO: Piece = { id: 1, color: 4, cells: [[0, 0]] };

function fillRow(board: Board, row: number, color = 1): void {
  for (let c = 0; c < 10; c++) board[row][c] = color;
}

function mark(board: Board, r: number, c: number, color: number): void {
  board[r][c] = color;
}

test("Sunilown: a cleared row drops every block above it by one", () => {
  const board = emptyBoard();
  mark(board, 6, 2, 7);
  mark(board, 6, 3, 7);
  fillRow(board, 9, 2);
  board[9][0] = 0;
  const placed = placeOn(board, MONO, 9, 0);
  const { rows, cols } = findFullLines(placed);
  assert.deepEqual(rows, [9]);
  const next = applyClearWithGravity(placed, rows, cols);
  assert.equal(next[7][2], 7);
  assert.equal(next[7][3], 7);
  assert.equal(next[6][2], 0);
  assert.equal(next[6][3], 0);
  assert.ok(next[9].every((v) => v === 0));
});

test("Sunilown: two rows in one move drop by the count of cleared rows beneath", () => {
  const board = emptyBoard();
  mark(board, 5, 1, 3); // C — two cleared rows beneath
  mark(board, 6, 4, 5); // A — two cleared rows beneath
  fillRow(board, 7, 2);
  mark(board, 8, 2, 6); // B — one cleared row beneath
  fillRow(board, 9, 2);
  board[7][0] = 0;
  board[9][0] = 0;
  let placed = placeOn(board, MONO, 7, 0);
  placed = placeOn(placed, MONO, 9, 0);
  const { rows, cols } = findFullLines(placed);
  assert.deepEqual(rows, [7, 9]);
  const next = applyClearWithGravity(placed, rows, cols);
  assert.equal(next[7][1], 3);
  assert.equal(next[8][4], 5);
  assert.equal(next[9][2], 6);
  assert.equal(next[5][1], 0);
  assert.equal(next[6][4], 0);
  assert.equal(next[8][2], 0);
});

test("Sunilown: adjacent double-clear drops blocks above by two", () => {
  const board = emptyBoard();
  mark(board, 5, 0, 8);
  fillRow(board, 8, 1);
  fillRow(board, 9, 1);
  board[8][9] = 0;
  board[9][9] = 0;
  const stacked: Piece = {
    id: 2,
    color: 4,
    cells: [
      [0, 0],
      [1, 0],
    ],
  };
  const placed = placeOn(board, stacked, 8, 9);
  const { rows } = findFullLines(placed);
  assert.deepEqual(rows, [8, 9]);
  const next = applyClearWithGravity(placed, rows, []);
  assert.equal(next[7][0], 8);
  assert.equal(next[5][0], 0);
  assert.ok(next[8].every((v) => v === 0));
  assert.ok(next[9].every((v) => v === 0));
});

test("Sunilown: holes in a surviving row stay holes after the drop", () => {
  const board = emptyBoard();
  mark(board, 7, 0, 9);
  mark(board, 7, 2, 9);
  fillRow(board, 9, 1);
  const { rows } = findFullLines(board);
  const settled = applyClearWithGravity(board, rows, []);
  assert.equal(settled[8][0], 9);
  assert.equal(settled[8][1], 0);
  assert.equal(settled[8][2], 9);
});

test("Sunilown: column-only clear does not drop rows", () => {
  const board = emptyBoard();
  for (let r = 0; r < 10; r++) board[r][3] = 2;
  mark(board, 4, 7, 5);
  const { rows, cols } = findFullLines(board);
  assert.deepEqual(rows, []);
  assert.deepEqual(cols, [3]);
  const next = applyClearWithGravity(board, rows, cols);
  assert.equal(next[4][7], 5);
  assert.ok(next.every((row) => row[3] === 0));
});

test("scoreFor: single row or column clear is cells + 10 * lines * combo", () => {
  assert.equal(scoreFor(1, 1, 1), 11);
  assert.equal(scoreFor(4, 1, 1), 14);
  assert.equal(scoreFor(1, 1, 2), 21);
  assert.equal(scoreFor(3, 1, 1), 13);
});

test("scoreFor: multi clear in one placement multiplies line count", () => {
  assert.equal(scoreFor(1, 2, 1), 21);
  assert.equal(scoreFor(2, 2, 1), 22);
  assert.equal(scoreFor(1, 3, 1), 31);
  assert.equal(scoreFor(2, 3, 2), 62);
});

test("scoreFor: placement without a clear is only the cell count", () => {
  assert.equal(scoreFor(5, 0, 1), 5);
  assert.equal(scoreFor(3, 0, 99), 3);
});

test("Sunilown: after N rows clear, every occupied cell above drops exactly N", () => {
  for (const n of [1, 2, 3]) {
    const board = emptyBoard();
    const markers: Array<{ r: number; c: number; color: number }> = [];
    let color = 2;
    for (let r = 0; r < 10 - n; r++) {
      for (const c of [0, 3, 7, 9]) {
        if ((r + c) % 2 === 0) {
          board[r][c] = color;
          markers.push({ r, c, color });
          color = color === 9 ? 2 : color + 1;
        }
      }
    }
    for (let i = 0; i < n; i++) fillRow(board, 10 - n + i, 1);
    const { rows } = findFullLines(board);
    assert.deepEqual(
      rows,
      Array.from({ length: n }, (_, i) => 10 - n + i),
    );
    const next = applyClearWithGravity(board, rows, []);
    assert.ok(markers.length > 0);
    const expected = emptyBoard();
    for (const m of markers) expected[m.r + n][m.c] = m.color;
    assert.deepEqual(
      next,
      expected,
      `N=${n}: every occupied cell above must drop exactly ${n} (no floaters, no under-drop)`,
    );
  }
});

test("game-over: no legal placement remains when leftovers cannot fit", () => {
  const full = emptyBoard();
  for (let r = 0; r < 10; r++) fillRow(full, r);
  assert.equal(anyRemainingFits(full, [MONO]), false);

  const oneHole = emptyBoard();
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (!(r === 0 && c === 0)) oneHole[r][c] = 1;
    }
  }
  const bar5: Piece = {
    id: 2,
    color: 1,
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  };
  assert.equal(anyRemainingFits(oneHole, [bar5]), false);
  assert.equal(anyRemainingFits(oneHole, [MONO]), true);
  assert.equal(anyRemainingFits(oneHole, [bar5, MONO]), true);
  assert.equal(anyRemainingFits(oneHole, [bar5, bar5]), false);
  assert.equal(anyRemainingFits(emptyBoard(), [bar5]), true);
});

test("settleSunilown packs a cleared bottom row and is a no-op when nothing is full", () => {
  const idle = emptyBoard();
  mark(idle, 3, 3, 1);
  const none = settleSunilown(idle);
  assert.deepEqual(none.waves, []);
  assert.equal(none.board[3][3], 1);

  const board = emptyBoard();
  mark(board, 4, 2, 6);
  fillRow(board, 9, 3);
  const { board: settled, waves } = settleSunilown(board);
  assert.equal(waves.length, 1);
  assert.deepEqual(waves[0].rows, [9]);
  assert.equal(settled[5][2], 6);
  assert.equal(settled[4][2], 0);
});
