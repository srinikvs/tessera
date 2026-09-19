import { expect, type Page } from "@playwright/test";

export const SAVE_KEY = "tessera-save-v1";
export const BEST_KEY = "tessera-best-v1";

export type TrayPiece = {
  cells: Array<[number, number]>;
  color: number;
  id: number;
};

export type SaveData = {
  board: number[][];
  tray: Array<TrayPiece | null>;
  score: number;
  combo: number;
  best: number;
  nextPieceId: number;
  screen: "start" | "play" | "paused" | "ending" | "over";
};

export const MONO: TrayPiece = { cells: [[0, 0]], color: 4, id: 1 };
export const VERT_DOMINO: TrayPiece = {
  cells: [
    [0, 0],
    [1, 0],
  ],
  color: 5,
  id: 2,
};
export const I5_TALL: TrayPiece = {
  cells: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  color: 3,
  id: 3,
};
export const I5_WIDE: TrayPiece = {
  cells: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
  color: 6,
  id: 4,
};
export const SQUARE: TrayPiece = {
  cells: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  color: 2,
  id: 5,
};

export function emptyBoard(): number[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(0));
}

export function fillRowExcept(board: number[][], row: number, exceptCol: number, color = 2): void {
  for (let c = 0; c < 10; c++) {
    if (c !== exceptCol) board[row][c] = color;
  }
}

export function makeSave(partial: Partial<SaveData> = {}): SaveData {
  return {
    board: emptyBoard(),
    tray: [MONO, SQUARE, VERT_DOMINO],
    score: 10,
    combo: 0,
    best: 10,
    nextPieceId: 100,
    screen: "play",
    ...partial,
  };
}

/** Seed once per tab. Reload keeps whatever the game persisted. */
export async function seedAndOpen(page: Page, save: SaveData, best = save.best): Promise<void> {
  await page.addInitScript(
    ({ save, best, SAVE_KEY, BEST_KEY }) => {
      if (sessionStorage.getItem("tessera-e2e-seeded")) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      localStorage.setItem(BEST_KEY, String(best));
      sessionStorage.setItem("tessera-e2e-seeded", "1");
    },
    { save, best, SAVE_KEY, BEST_KEY },
  );
  await page.goto("./");
  await expect(page.getByTestId("tray")).toBeVisible();
  await waitForBoardMetrics(page);
}

export async function openFresh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("tessera-e2e-cleared")) return;
    localStorage.clear();
    sessionStorage.setItem("tessera-e2e-cleared", "1");
  });
  await page.goto("./");
  await expect(page.getByTestId("start-panel")).toBeVisible();
}

export async function waitForBoardMetrics(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.getByTestId("app").evaluate((el) => {
        return parseFloat(getComputedStyle(el).getPropertyValue("--tessera-cell"));
      });
    })
    .toBeGreaterThan(10);
}

export async function boardMetrics(page: Page): Promise<{
  cell: number;
  gap: number;
  boardX: number;
  boardY: number;
  boardPx: number;
}> {
  return page.getByTestId("app").evaluate((el) => {
    const cs = getComputedStyle(el);
    const num = (name: string) => parseFloat(cs.getPropertyValue(name));
    return {
      cell: num("--tessera-cell"),
      gap: num("--tessera-gap"),
      boardX: num("--tessera-board-x"),
      boardY: num("--tessera-board-y"),
      boardPx: num("--tessera-board-px"),
    };
  });
}

export async function dragTrayToCell(page: Page, slot: number, row: number, col: number): Promise<void> {
  const well = page.getByTestId(`tray-slot-${slot}`);
  await expect(well).toBeVisible();
  const start = await well.boundingBox();
  if (!start) throw new Error(`tray slot ${slot} has no box`);
  const m = await boardMetrics(page);
  const canvas = await page.getByTestId("board").boundingBox();
  if (!canvas) throw new Error("board canvas has no box");
  const dest = {
    x: canvas.x + m.boardX + (col + 0.5) * m.cell,
    y: canvas.y + m.boardY + (row + 0.5) * m.cell,
  };
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(dest.x, dest.y, { steps: 16 });
  await page.mouse.up();
}

export async function readSave(page: Page): Promise<SaveData | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  }, SAVE_KEY);
}

export async function readBest(page: Page): Promise<number> {
  return page.evaluate((key) => Number(localStorage.getItem(key) || 0) || 0, BEST_KEY);
}

export async function filledTrayCount(page: Page): Promise<number> {
  return page.locator("[data-testid^='tray-slot-'] .mini-piece").count();
}

export async function waitForFilledTray(page: Page, min = 1): Promise<void> {
  await expect.poll(async () => filledTrayCount(page)).toBeGreaterThanOrEqual(min);
}

export function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}
