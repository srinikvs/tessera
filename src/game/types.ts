export const BOARD_SIZE = 10;

export type Board = number[][];
export type Shape = Array<[number, number]>;

export interface Piece {
  id: number;
  cells: Shape;
  color: number;
}

export type Screen = "start" | "play" | "paused" | "ending" | "over";

export interface TrayView {
  cells: Array<[number, number]>;
  color: number;
}

export interface UiState {
  screen: Screen;
  score: number;
  best: number;
  combo: number;
  muted: boolean;
  canContinue: boolean;
  canUndo: boolean;
  hint: boolean;
  /** 0→1 while screen is "ending" */
  endProgress: number;
  tray: Array<TrayView | null>;
  trayFits: boolean[];
  draggingSlot: number | null;
  trayCell: number;
  trayTop: number;
}

export interface PublicEngine {
  newGame: () => void;
  continueGame: () => void;
  undo: () => void;
  pause: () => void;
  resume: () => void;
  toggleMute: () => void;
  beginTrayDrag: (slot: number, e: { clientX: number; clientY: number; pointerId: number; pointerType: string }) => void;
  destroy: () => void;
}
