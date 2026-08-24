import {
  anyFit,
  anyRemainingFits,
  canPlace,
  cloneBoard,
  comboLabel,
  emptyBoard,
  findFullLines,
  placeOn,
  scoreFor,
} from "./logic";
import { pickShape } from "./pieces";
import {
  computeLayout,
  drawBoard,
  drawBoardFrame,
  drawCombo,
  drawDragPiece,
  drawFloaters,
  drawGhost,
  drawLinePreview,
  drawParticles,
  drawTraySlots,
  hitTrayPiece,
  pointerToCell,
  type Floater,
  type Layout,
  type Particle,
} from "./render";
import { COLORS } from "./theme";
import {
  loadBest,
  loadHintSeen,
  loadMuted,
  loadSave,
  snapshotSave,
  trayFromSave,
  writeHintSeen,
  writeMuted,
  writeSave,
} from "./save";
import {
  installUnlockHooks,
  resumeAudio,
  setMuted,
  sfxClear,
  sfxCombo,
  sfxDeal,
  sfxOver,
  sfxPickup,
  sfxPlace,
  sfxReject,
  unlockAudio,
} from "./audio";
import { BOARD_SIZE, type Board, type Piece, type PublicEngine, type Screen, type UiState } from "./types";

interface Drag {
  slot: number;
  piece: Piece;
  grabR: number;
  grabC: number;
  x: number;
  y: number;
  pointerId: number;
  lift: number;
}

interface UndoSnap {
  board: Board;
  tray: Array<Piece | null>;
  score: number;
  combo: number;
}

const POP_DUR = 0.16;
const CLEAR_FLASH = 0.12;
const CLEAR_SHRINK = 0.2;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function hashNoise(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  onUi: (ui: UiState) => void,
): PublicEngine {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("Canvas 2D unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let board = emptyBoard();
  let tray: Array<Piece | null> = [null, null, null];
  let trayFits: boolean[] = [true, true, true];
  let score = 0;
  let combo = 0;
  let best = loadBest();
  let nextPieceId = 1;
  let screen: Screen = "start";
  let muted = loadMuted();
  let hint = !loadHintSeen();
  let undo: UndoSnap | null = null;

  let layout: Layout = computeLayout(1, 1);
  let drag: Drag | null = null;
  let dragRect: DOMRect | null = null;
  let raf = 0;
  let last = performance.now();
  let running = true;
  let reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let trauma = 0;
  let freeze = 0;
  let particles: Particle[] = [];
  let floaters: Floater[] = [];
  let comboFx: { text: string; t: number } | null = null;
  let pop = new Map<string, number>();
  let phase: "idle" | "clearing" = "idle";
  let clearT = 0;
  let pendingClear: { rows: number[]; cols: number[] } | null = null;
  const dprCap = 2;

  setMuted(muted);
  installUnlockHooks();

  function emitUi(): void {
    onUi({
      screen,
      score,
      best,
      combo,
      muted,
      canContinue: canContinue(),
      canUndo: !!undo && screen === "play" && phase === "idle" && !drag,
      hint: hint && screen === "play",
    });
  }

  function canContinue(): boolean {
    if (screen === "play") return score > 0;
    const s = loadSave();
    return !!(s && s.screen === "play" && s.score > 0);
  }

  function persist(): void {
    if (screen === "start") return;
    writeSave(
      snapshotSave({
        board,
        tray,
        score,
        combo,
        best,
        nextPieceId,
        screen,
      }),
    );
  }

  function refreshFits(): void {
    trayFits = tray.map((p) => (p ? anyFit(board, p) : true));
  }

  function refillTray(): void {
    for (let i = 0; i < 3; i++) {
      if (!tray[i]) tray[i] = pickShape({ n: nextPieceId++ });
    }
    // ensure at least one placeable when board is empty-ish
    for (let attempt = 0; attempt < 10; attempt++) {
      refreshFits();
      if (trayFits.some((f, i) => tray[i] && f)) break;
      tray = [pickShape({ n: nextPieceId++ }), pickShape({ n: nextPieceId++ }), pickShape({ n: nextPieceId++ })];
    }
    refreshFits();
    sfxDeal();
  }

  function afterPlaceResolved(): void {
    if (tray.every((p) => p === null)) refillTray();
    else refreshFits();
    if (!anyRemainingFits(board, tray)) {
      screen = "over";
      sfxOver();
      persist();
      emitUi();
      return;
    }
    persist();
  }

  function spawnParticles(rows: number[], cols: number[]): void {
    const setR = new Set(rows);
    const setC = new Set(cols);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!setR.has(r) && !setC.has(c)) continue;
        const v = board[r][c];
        if (!v) continue;
        const { x, y, s } = {
          x: layout.boardX + c * layout.cell + layout.cell / 2,
          y: layout.boardY + r * layout.cell + layout.cell / 2,
          s: layout.cell * 0.2,
        };
        for (let i = 0; i < 4; i++) {
          particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 220,
            vy: (Math.random() - 0.8) * 220,
            life: 0.5 + Math.random() * 0.4,
            color: COLORS[(v - 1) % COLORS.length],
            size: s * (0.3 + Math.random() * 0.5),
          });
        }
      }
    }
  }

  function applyClear(): void {
    if (!pendingClear) return;
    const rowSet = new Set(pendingClear.rows);
    const colSet = new Set(pendingClear.cols);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (rowSet.has(r) || colSet.has(c)) board[r][c] = 0;
      }
    }
    pendingClear = null;
    phase = "idle";
    afterPlaceResolved();
  }

  function commitPlace(slot: number, piece: Piece, row: number, col: number): void {
    undo = {
      board: cloneBoard(board),
      tray: tray.map((p) => (p ? { ...p, cells: [...p.cells] } : null)),
      score,
      combo,
    };
    board = placeOn(board, piece, row, col);
    tray[slot] = null;
    for (const [dr, dc] of piece.cells) {
      pop.set(`${row + dr},${col + dc}`, 0);
    }
    const { rows, cols } = findFullLines(board);
    const lines = rows.length + cols.length;
    const cells = piece.cells.length;
    if (lines > 0) combo += 1;
    else combo = 0;
    const gained = scoreFor(cells, lines, Math.max(combo, 1));
    score += gained;
    if (score > best) best = score;

    trauma = Math.min(1, trauma + 0.1);

    const cx = layout.boardX + (col + 0.5) * layout.cell;
    const cy = layout.boardY + (row + 0.5) * layout.cell;
    floaters.push({
      text: `+${gained}`,
      x: cx,
      y: cy,
      t: 0,
      color: "#f2f1ee",
    });

    if (hint) {
      hint = false;
      writeHintSeen();
    }

    if (lines > 0) {
      pendingClear = { rows, cols };
      phase = "clearing";
      clearT = 0;
      spawnParticles(rows, cols);
      sfxClear(lines);
      const label = comboLabel(lines, combo);
      if (label) {
        comboFx = { text: label, t: 0 };
        sfxCombo();
      }
      trauma = Math.min(1, trauma + 0.15 + lines * 0.08);
      if (lines >= 3 && !reduced) freeze = 0.05;
    } else {
      sfxPlace();
      afterPlaceResolved();
    }
    emitUi();
  }

  function newGame(): void {
    unlockAudio();
    board = emptyBoard();
    score = 0;
    combo = 0;
    undo = null;
    pop.clear();
    particles = [];
    floaters = [];
    comboFx = null;
    phase = "idle";
    pendingClear = null;
    setDrag(null);
    tray = [null, null, null];
    refillTray();
    screen = "play";
    persist();
    emitUi();
  }

  function continueGame(): void {
    unlockAudio();
    const s = loadSave();
    if (!s || s.screen !== "play") {
      newGame();
      return;
    }
    board = s.board.map((row) => row.slice());
    const id = { n: s.nextPieceId || 1 };
    tray = trayFromSave(s.tray, id);
    nextPieceId = id.n;
    score = s.score;
    combo = s.combo;
    best = Math.max(best, s.best);
    if (tray.every((p) => p === null)) refillTray();
    else refreshFits();
    screen = "play";
    undo = null;
    emitUi();
    persist();
  }

  function doUndo(): void {
    if (!undo || screen !== "play" || phase !== "idle" || drag) return;
    board = undo.board;
    tray = undo.tray;
    score = undo.score;
    combo = undo.combo;
    undo = null;
    refreshFits();
    persist();
    emitUi();
  }

  function resize(): void {
    if (drag) return;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = getComputedStyle(document.documentElement);
    const sat = parseFloat(s.getPropertyValue("--sat")) || 0;
    const sab = parseFloat(s.getPropertyValue("--sab")) || 0;
    const wide = window.matchMedia("(min-width: 640px)").matches;
    layout = computeLayout(w, h, {
      top: sat + 58,
      bottom: sab + (wide ? 12 : 36),
    });
  }

  function eventPos(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = dragRect ?? canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hoverOrigin(d: Drag): { row: number; col: number } {
    const { r, c } = pointerToCell(layout, d.x, d.y - d.lift);
    return { row: r - d.grabR, col: c - d.grabC };
  }

  function setDrag(next: Drag | null): void {
    drag = next;
    if (!next) {
      dragRect = null;
      window.removeEventListener("touchmove", onTouchMove);
    } else {
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    }
    document.documentElement.classList.toggle("tessera-drag", !!next);
  }

  function dropDrag(): void {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    try {
      canvas.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    const { row, col } = hoverOrigin(d);
    if (canPlace(board, d.piece, row, col)) {
      commitPlace(d.slot, d.piece, row, col);
    } else {
      sfxReject();
      emitUi();
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (screen !== "play" || phase !== "idle") return;
    dragRect = canvas.getBoundingClientRect();
    const { x, y } = eventPos(e);
    const hit = hitTrayPiece(layout, tray, x, y);
    if (!hit) {
      dragRect = null;
      return;
    }
    const piece = tray[hit.slot];
    if (!piece) {
      dragRect = null;
      return;
    }
    e.preventDefault();
    setDrag({
      slot: hit.slot,
      piece,
      grabR: hit.grabR,
      grabC: hit.grabC,
      x,
      y,
      pointerId: e.pointerId,
      lift: e.pointerType === "mouse" ? 0 : layout.cell * 0.9,
    });
    if (e.pointerType === "mouse") {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    }
    sfxPickup();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = eventPos(e);
    drag.x = x;
    drag.y = y;
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = eventPos(e);
    drag.x = x;
    drag.y = y;
    dropDrag();
  }

  function onTouchMove(e: TouchEvent): void {
    if (!drag) return;
    e.preventDefault();
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    const { x, y } = eventPos(t);
    drag.x = x;
    drag.y = y;
  }

  function onTouchEnd(e: TouchEvent): void {
    if (!drag) return;
    const t = e.changedTouches[0];
    if (t) {
      const { x, y } = eventPos(t);
      drag.x = x;
      drag.y = y;
    }
    dropDrag();
  }

  function update(dt: number): void {
    if (freeze > 0) {
      freeze -= dt;
      dt *= 0.15;
    }
    trauma = Math.max(0, trauma - dt * 2.4);

    if (phase === "clearing") {
      clearT += dt;
      if (clearT >= CLEAR_FLASH + CLEAR_SHRINK) applyClear();
    }

    const nextPop = new Map<string, number>();
    for (const [k, t] of pop) {
      const n = t + dt / POP_DUR;
      if (n < 1) nextPop.set(k, n);
    }
    pop = nextPop;

    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
    }
    particles = particles.filter((p) => p.life > 0).slice(-180);

    for (const f of floaters) f.t += dt;
    floaters = floaters.filter((f) => f.t < 0.9);

    if (comboFx) {
      comboFx.t += dt;
      if (comboFx.t > 1.15) comboFx = null;
    }
  }

  function draw(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);

    const shake = trauma * trauma;
    const t = performance.now() / 1000;
    const ox = reduced ? 0 : shake * 7 * hashNoise(t * 37);
    const oy = reduced ? 0 : shake * 7 * hashNoise(t * 41 + 8);
    ctx.save();
    ctx.translate(ox, oy);

    if (screen !== "start") {
      drawBoardFrame(ctx, layout);
      let clearing = null;
      if (phase === "clearing" && pendingClear) {
        const flash = reduced ? 0.4 : Math.max(0, 1 - clearT / CLEAR_FLASH);
        const st = Math.max(0, clearT - CLEAR_FLASH) / CLEAR_SHRINK;
        const scale = reduced ? 0.6 : Math.max(0.05, 1 - st);
        clearing = {
          rows: new Set(pendingClear.rows),
          cols: new Set(pendingClear.cols),
          flash,
          scale,
        };
      }
      const popScale = new Map<string, number>();
      for (const [k, p] of pop) {
        const e = easeOutBack(Math.min(1, p));
        popScale.set(k, 0.72 + 0.28 * e);
      }
      drawBoard(ctx, layout, board, popScale, clearing);

      if (drag && screen === "play") {
        const { row, col } = hoverOrigin(drag);
        const ok = canPlace(board, drag.piece, row, col);
        drawGhost(ctx, layout, drag.piece, row, col, ok);
        if (ok) {
          const preview = placeOn(board, drag.piece, row, col);
          const lines = findFullLines(preview);
          if (lines.rows.length + lines.cols.length > 0) {
            drawLinePreview(ctx, layout, lines.rows, lines.cols);
          }
        }
      }

      drawTraySlots(ctx, layout, tray, drag ? drag.slot : null, trayFits);

      if (drag) {
        drawDragPiece(
          ctx,
          drag.piece,
          drag.x,
          drag.y - drag.lift,
          drag.grabR,
          drag.grabC,
          layout.cell,
          layout.gap,
          trayFits[drag.slot] === false,
        );
      }

      drawParticles(ctx, particles);
      drawFloaters(ctx, floaters);
      if (comboFx) drawCombo(ctx, layout, comboFx.text, comboFx.t);
    }

    ctx.restore();
  }

  function loop(now: number): void {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (screen === "play") update(dt);
    else {
      trauma = Math.max(0, trauma - dt * 2);
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      particles = particles.filter((p) => p.life > 0);
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (screen === "play") {
        screen = "paused";
        persist();
        emitUi();
      } else if (screen === "paused") {
        screen = "play";
        emitUi();
      }
    } else if (e.key === "z" || e.key === "Z") {
      if (e.metaKey || e.ctrlKey) e.preventDefault();
      doUndo();
    } else if (e.key === "u" || e.key === "U") {
      doUndo();
    }
  }

  function onVis(): void {
    if (document.visibilityState === "hidden") persist();
    else resumeAudio();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", onTouchEnd);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVis);

  raf = requestAnimationFrame(loop);
  emitUi();

  return {
    newGame,
    continueGame,
    undo: doUndo,
    pause: () => {
      if (screen === "play") {
        screen = "paused";
        persist();
        emitUi();
      }
    },
    resume: () => {
      if (screen === "paused") {
        screen = "play";
        unlockAudio();
        emitUi();
      }
    },
    toggleMute: () => {
      muted = !muted;
      setMuted(muted);
      writeMuted(muted);
      unlockAudio();
      emitUi();
    },
    destroy: () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      setDrag(null);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      persist();
    },
  };
}
