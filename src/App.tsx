import { useEffect, useRef, useState, type ReactNode } from "react";
import { createEngine } from "./game/engine";
import { drawPiece } from "./game/render";
import { loadBest, loadSave } from "./game/save";
import type { PublicEngine, TrayView, UiState } from "./game/types";

const initialUi = (): UiState => {
  const save = loadSave();
  const resume =
    !!save && (save.screen === "play" || save.screen === "paused") && save.score > 0;
  return {
    screen: resume ? "play" : "start",
    score: resume ? save!.score : 0,
    best: loadBest(),
    combo: resume ? save!.combo : 0,
    muted: false,
    canContinue: resume,
    canUndo: false,
    hint: false,
    endProgress: 0,
    tray: [null, null, null],
    trayFits: [true, true, true],
    draggingSlot: null,
    trayCell: 22,
  };
};

function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PublicEngine | null>(null);
  const [ui, setUi] = useState<UiState>(initialUi);
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    const save = loadSave();
    setUi((s) => ({
      ...s,
      best: loadBest(),
      canContinue: !!(save && (save.screen === "play" || save.screen === "paused") && save.score > 0),
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createEngine(canvas, setUi);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const boardLive = ui.screen === "play" || ui.screen === "ending";
  const overlay =
    ui.screen === "start" || ui.screen === "paused" || ui.screen === "over";

  return (
    <div className="app">
      <canvas ref={canvasRef} />

      {boardLive && (
        <header className={`hud${ui.screen === "ending" ? " hud-dim" : ""}`}>
          <button
            type="button"
            className="title"
            onClick={() => engineRef.current?.pause()}
            disabled={ui.screen === "ending"}
          >
            Tessera
          </button>
          <div className="hud-stats">
            <div className="score-wrap">
              <span className="label">Best</span>
              <span className="score">{formatScore(ui.best)}</span>
            </div>
            <div className="score-wrap">
              <span className="label">Score</span>
              <span className="score">{formatScore(ui.score)}</span>
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={ui.muted ? "Unmute" : "Mute"}
              onClick={() => engineRef.current?.toggleMute()}
              disabled={ui.screen === "ending"}
            >
              {ui.muted ? <IconVolumeOff /> : <IconVolume />}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Undo"
              disabled={!ui.canUndo || ui.screen === "ending"}
              onClick={() => engineRef.current?.undo()}
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Pause"
              disabled={ui.screen === "ending"}
              onClick={() => engineRef.current?.pause()}
            >
              <IconPause />
            </button>
          </div>
        </header>
      )}

      {ui.hint && ui.screen === "play" && (
        <p className="hint">Drag a block onto the board. A full row or column clears.</p>
      )}

      {ui.screen === "play" && (
        <footer className="foot">
          {ui.combo > 1 ? <span>Combo ×{ui.combo}</span> : <span>No time limit</span>}
        </footer>
      )}

      {boardLive && (
        <div className="tray-dock" aria-label="Block tray">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              className="tray-well"
              aria-label={`Tray slot ${i + 1}`}
              disabled={ui.screen === "ending"}
              onPointerDown={(e) => {
                if (ui.screen !== "play") return;
                e.preventDefault();
                engineRef.current?.beginTrayDrag(i, e);
              }}
            >
              {ui.tray[i] && ui.draggingSlot !== i ? (
                <MiniPiece piece={ui.tray[i]!} gray={ui.trayFits[i] === false} cell={ui.trayCell} />
              ) : null}
            </button>
          ))}
        </div>
      )}

      {ui.screen === "ending" && (
        <div
          className="end-veil"
          style={{ opacity: Math.min(1, ui.endProgress * 0.55) }}
          aria-live="polite"
        >
          <p className="end-veil-label" style={{ opacity: Math.min(1, Math.max(0, (ui.endProgress - 0.2) / 0.4)) }}>
            No more moves
          </p>
        </div>
      )}

      {overlay && (
        <div className="overlay">
          {ui.screen === "start" && (
            <StartPanel
              best={ui.best}
              canContinue={ui.canContinue}
              onPlay={() => engineRef.current?.newGame()}
              onContinue={() => engineRef.current?.continueGame()}
            />
          )}
          {ui.screen === "paused" && (
            <PausePanel
              score={ui.score}
              confirmNew={confirmNew}
              onResume={() => {
                setConfirmNew(false);
                engineRef.current?.resume();
              }}
              onNew={() => {
                if (ui.score > 0 && !confirmNew) {
                  setConfirmNew(true);
                  return;
                }
                setConfirmNew(false);
                engineRef.current?.newGame();
              }}
              onCancelNew={() => setConfirmNew(false)}
            />
          )}
          {ui.screen === "over" && (
            <OverPanel
              score={ui.score}
              best={ui.best}
              onAgain={() => engineRef.current?.newGame()}
            />
          )}
        </div>
      )}

      {ui.screen === "play" && confirmNew && (
        <div className="overlay" style={{ background: "rgb(12 13 16 / 95%)" }}>
          <PausePanel
            score={ui.score}
            confirmNew
            onResume={() => {
              setConfirmNew(false);
              engineRef.current?.resume();
            }}
            onNew={() => {
              setConfirmNew(false);
              engineRef.current?.newGame();
            }}
            onCancelNew={() => setConfirmNew(false)}
          />
        </div>
      )}
    </div>
  );
}

function StartPanel({
  best,
  canContinue,
  onPlay,
  onContinue,
}: {
  best: number;
  canContinue: boolean;
  onPlay: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="panel">
      <LogoMark />
      <h1>Tessera</h1>
      <p className="tag">Fit the blocks. Clear the lines.</p>
      <HowTo />
      <div className="actions-col">
        <button type="button" className="btn btn-primary" onClick={onPlay}>
          Play
        </button>
        {canContinue && (
          <button type="button" className="btn btn-outline" onClick={onContinue}>
            Continue
          </button>
        )}
      </div>
      <p className="meta">Best {formatScore(best)}</p>
      <p className="meta">v1.1.19</p>
    </div>
  );
}

function PausePanel({
  score,
  confirmNew,
  onResume,
  onNew,
  onCancelNew,
}: {
  score: number;
  confirmNew: boolean;
  onResume: () => void;
  onNew: () => void;
  onCancelNew: () => void;
}) {
  return (
    <div className="panel">
      <h2>{confirmNew ? "Start over?" : "Paused"}</h2>
      <p className="tag">
        {confirmNew
          ? `Your current score of ${formatScore(score)} will be lost.`
          : `Score ${formatScore(score)}`}
      </p>
      {!confirmNew && <HowTo />}
      <div className="actions-col">
        {confirmNew ? (
          <>
            <button type="button" className="btn btn-primary" onClick={onNew}>
              New game
            </button>
            <button type="button" className="btn btn-outline" onClick={onCancelNew}>
              Keep playing
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="btn btn-outline" onClick={onNew}>
              New game
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function OverPanel({
  score,
  best,
  onAgain,
}: {
  score: number;
  best: number;
  onAgain: () => void;
}) {
  const isBest = score >= best && score > 0;
  return (
    <div className="panel">
      <p className="over-label">No more moves</p>
      <p className="over-score">{formatScore(score)}</p>
      <p className="tag">{isBest ? "New best" : `Best ${formatScore(best)}`}</p>
      <div className="actions-col">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          Play again
        </button>
      </div>
    </div>
  );
}

function MiniPiece({ piece, gray, cell: tile }: { piece: TrayView; gray: boolean; cell: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let minR = Infinity;
      let minC = Infinity;
      let maxR = -Infinity;
      let maxC = -Infinity;
      for (const [r, c] of piece.cells) {
        if (r < minR) minR = r;
        if (c < minC) minC = c;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const rows = Math.max(1, maxR - minR + 1);
      const cols = Math.max(1, maxC - minC + 1);
      const cell = Math.max(20, Math.min(24, tile || 22));
      const gap = cell >= 22 ? 2.5 : 2;
      const w = cols * cell;
      const h = rows * cell;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawPiece(
        ctx,
        {
          id: 0,
          color: piece.color,
          cells: piece.cells.map(([r, c]) => [r - minR, c - minC] as [number, number]),
        },
        0,
        0,
        cell,
        gap,
        { gray },
      );
    };
    paint();
  }, [piece, gray, tile]);
  return <canvas ref={ref} className="tray-tiles" aria-hidden />;
}

function HowTo() {
  const steps = [
    "Drag a block from the tray onto the board. Blocks cannot be rotated.",
    "Completely filling a row or a column clears it and frees that space.",
    "Place all three tray pieces to get a new set. Leftover pieces stay after a line clear. Empty slots fill when a line clears. Blocks that cannot fit anywhere turn gray. If every leftover block is gray, the game ends.",
  ];
  return (
    <ol className="howto">
      {steps.map((step, i) => (
        <li key={step}>
          <span className="n">{i + 1}</span>
          <span className="t">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function LogoMark() {
  return (
    <svg className="logo" viewBox="0 0 72 72" aria-hidden="true">
      <rect width="72" height="72" rx="16" fill="#15161b" />
      <rect x="10" y="10" width="24" height="24" rx="6" fill="#e07060" />
      <rect x="38" y="10" width="24" height="24" rx="6" fill="#3d9b8f" />
      <rect x="10" y="38" width="24" height="24" rx="6" fill="#5a8fc7" />
      <rect x="38" y="38" width="24" height="24" rx="6" fill="#c46b8a" />
    </svg>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconVolume() {
  return (
    <Icon>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Icon>
  );
}

function IconVolumeOff() {
  return (
    <Icon>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </Icon>
  );
}

function IconUndo() {
  return (
    <Icon>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.2L3 13" />
    </Icon>
  );
}

function IconPause() {
  return (
    <Icon>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </Icon>
  );
}
