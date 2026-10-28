/**
 * Lightweight WebAudio sound effects — no asset files needed.
 * Each function lazily creates an AudioContext on first user gesture,
 * which satisfies browser autoplay policies.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

interface ToneOpts {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
  volume?: number;
  startOffset?: number; // seconds
  freqEnd?: number; // for frequency sweeps
}

function playTone({
  freq,
  duration,
  type = "sine",
  volume = 0.2,
  startOffset = 0,
  freqEnd,
}: ToneOpts) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime + startOffset;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export const sfx = {
  tap() {
    playTone({ freq: 880, duration: 0.08, type: "triangle", volume: 0.18 });
  },
  score() {
    playTone({ freq: 660, duration: 0.1, type: "triangle", volume: 0.22 });
    playTone({
      freq: 990,
      duration: 0.12,
      type: "triangle",
      volume: 0.18,
      startOffset: 0.06,
    });
  },
  miss() {
    playTone({
      freq: 220,
      freqEnd: 110,
      duration: 0.18,
      type: "sawtooth",
      volume: 0.16,
    });
  },
  combo() {
    playTone({ freq: 523, duration: 0.08, type: "square", volume: 0.14 });
    playTone({
      freq: 659,
      duration: 0.08,
      type: "square",
      volume: 0.14,
      startOffset: 0.05,
    });
    playTone({
      freq: 784,
      duration: 0.12,
      type: "square",
      volume: 0.16,
      startOffset: 0.1,
    });
  },
  start() {
    playTone({ freq: 440, duration: 0.1, type: "triangle", volume: 0.2 });
    playTone({
      freq: 660,
      duration: 0.14,
      type: "triangle",
      volume: 0.2,
      startOffset: 0.1,
    });
  },
  end() {
    playTone({ freq: 523, duration: 0.12, type: "sine", volume: 0.2 });
    playTone({
      freq: 392,
      duration: 0.12,
      type: "sine",
      volume: 0.2,
      startOffset: 0.12,
    });
    playTone({
      freq: 330,
      duration: 0.2,
      type: "sine",
      volume: 0.2,
      startOffset: 0.24,
    });
  },
  tick() {
    playTone({ freq: 1200, duration: 0.04, type: "square", volume: 0.08 });
  },
  countdown() {
    playTone({ freq: 440, duration: 0.1, type: "triangle", volume: 0.18 });
  },
  go() {
    playTone({ freq: 880, duration: 0.2, type: "triangle", volume: 0.25 });
  },
};

let muted = false;
export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted() {
  return muted;
}

/** Wrap an sfx function with a mute check. */
export function withMute<T extends (...args: never[]) => void>(fn: T): T {
  return ((...args: never[]) => {
    if (muted) return;
    fn(...args);
  }) as T;
}

/** Apply mute behavior to all sfx methods. Call once at module load. */
export function applyMuteToSfx() {
  for (const key of Object.keys(sfx) as (keyof typeof sfx)[]) {
    const original = sfx[key] as (...args: never[]) => void;
    (sfx[key] as (...args: never[]) => void) = withMute(original);
  }
}

applyMuteToSfx();
