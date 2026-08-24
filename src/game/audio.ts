let muted = false;
let unlocked = false;
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio(): void {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  void c.resume();
  unlocked = true;
  // tiny silent buffer to unlock iOS
  const buf = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  try {
    src.start(0);
  } catch {
    /* ignore */
  }
}

export function installUnlockHooks(): void {
  if (typeof window === "undefined") return;
  const kick = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", kick);
    window.removeEventListener("touchstart", kick);
    window.removeEventListener("click", kick);
  };
  window.addEventListener("pointerdown", kick);
  window.addEventListener("touchstart", kick, { passive: true });
  window.addEventListener("click", kick);
}

export function setMuted(next: boolean): void {
  muted = next;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  when = 0,
): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfxPickup(): void {
  tone(520, 0.06, "triangle", 0.08);
}

export function sfxPlace(): void {
  tone(280, 0.08, "square", 0.1);
  tone(360, 0.06, "sine", 0.06, 0.04);
}

export function sfxReject(): void {
  tone(160, 0.12, "sawtooth", 0.07);
}

export function sfxClear(lines: number): void {
  const n = Math.min(Math.max(lines, 1), 4);
  // bubble-blast style cascade
  for (let i = 0; i < n + 2; i++) {
    tone(420 + i * 90, 0.09, "sine", 0.12 - i * 0.015, i * 0.045);
    tone(640 + i * 70, 0.07, "triangle", 0.08, i * 0.045 + 0.02);
  }
}

export function sfxCombo(): void {
  tone(520, 0.08, "sine", 0.1);
  tone(680, 0.1, "triangle", 0.1, 0.06);
  tone(860, 0.12, "sine", 0.08, 0.12);
}

export function sfxOver(): void {
  tone(300, 0.2, "sine", 0.1);
  tone(220, 0.25, "triangle", 0.08, 0.12);
  tone(160, 0.3, "sine", 0.07, 0.28);
}

export function sfxDeal(): void {
  tone(400, 0.05, "triangle", 0.07);
  tone(480, 0.05, "triangle", 0.06, 0.05);
  tone(560, 0.06, "triangle", 0.05, 0.1);
}

export function resumeAudio(): void {
  unlockAudio();
}
