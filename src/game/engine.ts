import {
  anyFit,
  anyRemainingFits,
  applyLineClear,
  canPlace,
  cloneBoard,
  comboLabel,
  emptyBoard,
  findFullLines,
  hasProgress,
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
const END_HOLD = 3;

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
  let phase: "idle" | "clearing" | "ending" = "idle";
  let clearT = 0;
  let endingT = 0;
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
      endProgress: phase === "ending" ? Math.min(1, endingT / END_HOLD) : 0,
      tray: tray.map((p) =>
        pieceOk(p) ? { cells: p.cells.map(([a, b]) => [a, b] as [number, number]), color: p.color } : null,
      ),
      trayFits: trayFits.slice(),
      draggingSlot: drag ? drag.slot : null,
    });
  }

  function canContinue(): boolean {
    if (screen === "play" || screen === "paused") return score > 0;
    const s = loadSave();
    return !!(s && (s.screen === "play" || s.screen === "paused") && s.score > 0);
  }

  function persistPostClear(): void {
    writeSave(
      snapshotSave({
        board: logicalBoard(),
        tray,
        score,
        combo,
        best,
        nextPieceId,
        screen: "play",
      }),
    );
  }

  function persist(): void {
    if (screen === "start") return;
    if ((screen === "play" || screen === "ending" || screen === "paused") && !drag) {
      ensurePlayTray(false);
    }
    writeSave(
      snapshotSave({
        board: logicalBoard(),
        tray,
        score,
        combo,
        best,
        nextPieceId,
        screen:
          screen === "ending" || screen === "over" ? "over" : screen === "paused" ? "paused" : "play",
      }),
    );
  }

  function logicalBoard(): Board {
    if (pendingClear) return applyLineClear(board, pendingClear.rows, pendingClear.cols);
    return board;
  }

  function refreshFits(): void {
    const fitBoard = logicalBoard();
    try {
      trayFits = tray.map((p) => (pieceOk(p) ? anyFit(fitBoard, p) : true));
    } catch {
      trayFits = [true, true, true];
    }
  }

  let fillAfterClear = false;
  let leftoverSlots: number[] = [];

  function pieceOk(p: Piece | null): p is Piece {
    return !!p && Array.isArray(p.cells) && p.cells.length > 0;
  }

  function padTray(): void {
    if (!Array.isArray(tray)) tray = [null, null, null];
    while (tray.length < 3) tray.push(null);
    if (tray.length > 3) tray = tray.slice(0, 3);
  }

  function trayPlaceable(): boolean {
    const b = logicalBoard();
    try {
      return tray.some((p) => pieceOk(p) && anyFit(b, p));
    } catch {
      return false;
    }
  }

  function dealFitting(): Piece {
    const b = logicalBoard();
    for (let i = 0; i < 48; i++) {
      const p = pickShape({ n: nextPieceId++ });
      try {
        if (anyFit(b, p)) return p;
      } catch {
        /* try another */
      }
    }
    return { id: nextPieceId++, color: 1, cells: [[0, 0]] };
  }

  function fillEmptySlots(): boolean {
    padTray();
    const emptyIdx: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (!pieceOk(tray[i])) {
        tray[i] = null;
        emptyIdx.push(i);
      }
    }
    if (emptyIdx.length === 0) {
      refreshFits();
      return false;
    }
    for (const i of emptyIdx) {
      const next = [...tray];
      next[i] = dealFitting();
      tray = next;
    }
    if (!trayPlaceable()) {
      const next = [...tray];
      for (const i of emptyIdx) next[i] = dealFitting();
      tray = next;
    }
    refreshFits();
    try {
      sfxDeal();
    } catch {
      /* audio must not block a deal */
    }
    return true;
  }

  function finishClearTray(): void {
    fillAfterClear = true;
    padTray();
    if (tray.every((p) => !pieceOk(p))) {
      leftoverSlots = [];
      tray = [dealFitting(), dealFitting(), dealFitting()];
    } else {
      fillEmptySlots();
    }
    if (!trayPlaceable()) {
      tray = [0, 1, 2].map((i) =>
        leftoverSlots.includes(i) && pieceOk(tray[i]) ? tray[i] : dealFitting(),
      );
    }
    refreshFits();
    if (tray.every(pieceOk) && trayPlaceable()) fillAfterClear = false;
    emitUi();
  }

  function ensurePlayTray(fromClear: boolean): void {
    if (fromClear) fillAfterClear = true;
    if (screen !== "play" && screen !== "ending" && screen !== "paused") return;
    padTray();
    const must =
      fillAfterClear || pendingClear !== null || phase === "clearing" || tray.every((p) => !pieceOk(p));
    if (must) finishClearTray();
    else refreshFits();
  }

  function refillTray(): void {
    padTray();
    for (let i = 0; i < 3; i++) tray[i] = null;
    fillAfterClear = false;
    fillEmptySlots();
  }

  function beginEnding(): void {
    ensurePlayTray(true);
    setDrag(null);
    phase = "ending";
    endingT = 0;
    screen = "ending";
    try {
      sfxOver();
    } catch {
      /* ignore */
    }
    persist();
    emitUi();
  }

  function checkGameOver(): boolean {
    if (phase === "clearing" || pendingClear) return false;
    if (anyRemainingFits(logicalBoard(), tray)) return false;
    beginEnding();
    return true;
  }

  function afterPlaceResolved(fromClear = false): void {
    ensurePlayTray(fromClear);
    persist();
    emitUi();
    if (phase === "clearing" || pendingClear) return;
    checkGameOver();
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
    board = applyLineClear(board, pendingClear.rows, pendingClear.cols);
    pendingClear = null;
    phase = "idle";
    finishClearTray();
    persistPostClear();
    const s = loadSave();
    if (s) restoreSave(s);
    else emitUi();
    checkGameOver();
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
    leftoverSlots = [0, 1, 2].filter((i) => pieceOk(tray[i]));
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
      resize();
    }

    if (lines > 0) {
      pendingClear = { rows, cols };
      phase = "clearing";
      clearT = 0;
      ensurePlayTray(true);
      persist();
      try {
        spawnParticles(rows, cols);
        sfxClear(lines);
        const label = comboLabel(lines, combo);
        if (label) {
          comboFx = { text: label, t: 0 };
          sfxCombo();
        }
      } catch {
        /* juice must not block refill */
      }
      trauma = Math.min(1, trauma + 0.15 + lines * 0.08);
      if (lines >= 3 && !reduced) freeze = 0.05;
      emitUi();
      if (reduced) applyClear();
    } else {
      try {
        sfxPlace();
      } catch {
        /* ignore */
      }
      afterPlaceResolved();
    }
  }

  function resetSession(): void {
    undo = null;
    pop.clear();
    particles = [];
    floaters = [];
    comboFx = null;
    phase = "idle";
    pendingClear = null;
    endingT = 0;
    clearT = 0;
    trauma = 0;
    freeze = 0;
    setDrag(null);
  }

  function newGame(): void {
    unlockAudio();
    resetSession();
    board = emptyBoard();
    score = 0;
    combo = 0;
    nextPieceId = 1;
    tray = [null, null, null];
    trayFits = [true, true, true];
    screen = "play";
    refillTray();
    persist();
    resize();
    emitUi();
  }

  function restoreSave(s: NonNullable<ReturnType<typeof loadSave>>): boolean {
    const keptScore = Math.max(score, s.score || 0);
    const keptCombo = Math.max(combo, s.combo || 0);
    const keptBest = Math.max(best, s.best || 0);
    const keptTray = tray.map((p) =>
      pieceOk(p) ? { ...p, cells: p.cells.map(([a, b]) => [a, b] as [number, number]) } : null,
    );
    board = (s.board || emptyBoard()).map((row) => row.slice());
    const id = { n: Math.max(nextPieceId, s.nextPieceId || 1) };
    const loaded = Array.isArray(s.tray) ? trayFromSave(s.tray, id) : [null, null, null];
    padTray();
    const loadedN = loaded.filter(pieceOk).length;
    const keptN = keptTray.filter(pieceOk).length;
    tray = loadedN >= keptN ? loaded : keptTray;
    nextPieceId = id.n;
    score = keptScore;
    combo = keptCombo;
    best = keptBest;
    resetSession();
    screen = "play";
    finishClearTray();
    persistPostClear();
    resize();
    emitUi();
    return true;
  }

  function continueGame(): void {
    unlockAudio();
    const s = loadSave();
    if (!s || (s.screen !== "play" && s.screen !== "paused") || !hasProgress(s.board || emptyBoard(), s.score || 0)) {
      newGame();
      return;
    }
    restoreSave(s);
  }

  function wantsPlayPath(): boolean {
    try {
      const path = window.location.pathname.replace(/\/+$/, "");
      return path.endsWith("/play");
    } catch {
      return false;
    }
  }

  function boot(): void {
    const s = loadSave();
    const playable =
      !!s &&
      (s.screen === "play" || s.screen === "paused") &&
      hasProgress(s.board || emptyBoard(), s.score || 0);
    if (playable) {
      restoreSave(s!);
      return;
    }
    if (wantsPlayPath()) {
      newGame();
      return;
    }
    screen = "start";
    emitUi();
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
    const rawH = canvas.clientHeight;
    const vvH = window.visualViewport?.height;
    let h = Math.min(rawH, Math.round(vvH ?? rawH));
    // iOS URL-bar / visualViewport shrink after a line clear must not
    // push the tray off-screen. Ignore height-only dips while playing.
    if (
      (screen === "play" || screen === "ending") &&
      layout.h > 80 &&
      Math.abs(w - layout.w) < 2 &&
      h < layout.h * 0.92
    ) {
      h = layout.h;
    }
    if (w < 2 || h < 2) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = getComputedStyle(document.documentElement);
    const sat = parseFloat(s.getPropertyValue("--sat")) || 0;
    const sab = parseFloat(s.getPropertyValue("--sab")) || 0;
    const wide = window.matchMedia("(min-width: 640px)").matches;
    layout = computeLayout(w, h, {
      top: sat + 58 + (hint && screen === "play" && !wide ? 36 : 0),
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

  function beginTrayDrag(slot: number, e: { clientX: number; clientY: number; pointerId: number; pointerType: string }): void {
    if (screen !== "play" || phase === "ending") return;
    if (phase === "clearing") applyClear();
    ensurePlayTray(false);
    const piece = tray[slot];
    if (!pieceOk(piece)) return;
    dragRect = canvas.getBoundingClientRect();
    const { x, y } = eventPos(e);
    const [grabR, grabC] = piece.cells[0];
    setDrag({
      slot,
      piece,
      grabR,
      grabC,
      x,
      y,
      pointerId: e.pointerId,
      lift: e.pointerType === "mouse" ? 0 : Math.max(36, layout.cell * 0.9),
    });
    try {
      sfxPickup();
    } catch {
      /* ignore */
    }
    emitUi();
  }

  function onPointerDown(e: PointerEvent): void {
    if (screen !== "play" || phase === "ending") return;
    if (phase === "clearing") applyClear();
    dragRect = canvas.getBoundingClientRect();
    const { x, y } = eventPos(e);
    const hit = hitTrayPiece(layout, tray, x, y);
    if (!hit) {
      dragRect = null;
      return;
    }
    e.preventDefault();
    beginTrayDrag(hit.slot, e);
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
    if (screen === "play" && !drag) ensurePlayTray(false);

    if (phase === "ending") {
      endingT += dt;
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 180 * dt;
      }
      particles = particles.filter((p) => p.life > 0);
      for (const f of floaters) f.t += dt;
      floaters = floaters.filter((f) => f.t < 0.9);
      if (Math.floor(endingT * 10) !== Math.floor((endingT - dt) * 10)) emitUi();
      if (endingT >= END_HOLD) {
        phase = "idle";
        endingT = 0;
        screen = "over";
        persist();
        emitUi();
      }
      return;
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

    if (screen !== "start" && screen !== "over") {
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

      if (screen === "play" && !drag) ensurePlayTray(false);

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

    if (phase === "ending" || screen === "ending") {
      const p = Math.min(1, endingT / END_HOLD);
      const a = p * p * 0.88;
      ctx.fillStyle = `rgba(38, 40, 50, ${a})`;
      ctx.fillRect(0, 0, w, h);
      const textA = Math.min(1, Math.max(0, (p - 0.15) / 0.35));
      if (textA > 0) {
        ctx.globalAlpha = textA;
        ctx.fillStyle = "#f2f1ee";
        ctx.font = "500 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No more moves", w / 2, h / 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  function loop(now: number): void {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    try {
      if (screen === "play" || screen === "ending") update(dt);
      else {
        trauma = Math.max(0, trauma - dt * 2);
        for (const p of particles) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        particles = particles.filter((p) => p.life > 0);
      }
      if (screen === "play" && !drag) ensurePlayTray(false);
      draw();
    } catch {
      try {
        ensurePlayTray(true);
      } catch {
        /* keep the loop alive */
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (screen === "play" && phase !== "ending") {
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
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
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
  boot();

  return {
    newGame,
    continueGame,
    undo: doUndo,
    pause: () => {
      if (screen === "play" && phase !== "ending") {
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
    beginTrayDrag,
    destroy: () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
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
