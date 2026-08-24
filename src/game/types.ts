export const BOARD_SIZE = 10;

export type Board = number[][];
export type Shape = Array<[number, number]>;

export interface Piece {
  id: number;
  cells: Shape;
  color: number;
}

export type Screen = "start" | "play" | "paused" | "over";

export interface UiState {
  screen: Screen;
  score: number;
  best: number;
  combo: number;
  muted: boolean;
  canContinue: boolean;
  canUndo: boolean;
  hint: boolean;
}

export interface PublicEngine {
  newGame: () => void;
  continueGame: () => void;
  undo: () => void;
  pause: () => void;
  resume: () => void;
  toggleMute: () => void;
  destroy: () => void;
}
