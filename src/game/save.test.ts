import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { emptyBoard } from "./logic.ts";
import { loadBest, loadSave, snapshotSave, writeBest, writeSave } from "./save.ts";

const mem = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  },
});

beforeEach(() => mem.clear());

test("beating Best writes localStorage; a reload restores Best", () => {
  writeBest(10);
  assert.equal(loadBest(), 10);

  writeSave(
    snapshotSave({
      board: emptyBoard(),
      tray: [null, null, null],
      score: 42,
      combo: 0,
      best: 10,
      nextPieceId: 1,
      screen: "play",
    }),
  );

  assert.equal(loadBest(), 42);
  assert.equal(mem.get("tessera-best-v1"), "42");
  const saved = loadSave();
  assert.ok(saved);
  assert.equal(saved.score, 42);

  // Reload = new read from the same persisted keys.
  assert.equal(loadBest(), 42);
  assert.equal(loadSave()?.score, 42);
});

test("a lower run score does not lower the stored Best", () => {
  writeBest(80);
  writeSave(
    snapshotSave({
      board: emptyBoard(),
      tray: [null, null, null],
      score: 12,
      combo: 0,
      best: 80,
      nextPieceId: 1,
      screen: "play",
    }),
  );
  assert.equal(loadBest(), 80);
});
