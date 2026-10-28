"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { haptic, hapticNotify } from "@/lib/telegram";

export interface TapTargetResult {
  score: number;
  hits: number;
  misses: number;
  bestCombo: number;
  accuracy: number;
}

interface Target {
  id: number;
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
  size: number; // px
  bornAt: number;
  lifespan: number; // ms
  color: string;
  points: number;
  isBomb?: boolean;
}

interface Props {
  duration?: number; // seconds
  onEnd: (result: TapTargetResult) => void;
  onExit: () => void;
}

const COLORS = [
  "#ff5e7e", // pink
  "#ffb547", // amber
  "#4ade80", // green
  "#38bdf8", // sky
  "#c084fc", // purple
  "#fde047", // yellow
];

const BOMB_COLOR = "#1f1f2e";

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function TapTargetGame({
  duration = 30,
  onEnd,
  onExit,
}: Props) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [floaters, setFloaters] = useState<
    { id: number; x: number; y: number; text: string; color: string }[]
  >([]);
  const [shakeKey, setShakeKey] = useState(0);

  const playAreaRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const floaterIdRef = useRef(1);
  const startTimeRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const spawnIntervalRef = useRef<number>(900);
  const statsRef = useRef({ score: 0, hits: 0, misses: 0, bestCombo: 0 });
  const finishedRef = useRef(false);

  // Live ref to keep spawn rate climbing smoothly with elapsed time
  const elapsedRef = useRef(0);

  // Countdown then start
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      sfx.go();
      haptic("medium");
      // Defer to avoid cascading renders inside effect body
      queueMicrotask(() => {
        setCountdown(null);
        startTimeRef.current = performance.now();
      });
      return;
    }
    sfx.countdown();
    haptic("light");
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 700);
    return () => clearTimeout(t);
  }, [countdown]);

  // Timer
  useEffect(() => {
    if (countdown !== null) return;
    const interval = setInterval(() => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      elapsedRef.current = elapsed;
      const left = Math.max(0, duration - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [countdown, duration]);

  // Spawn loop — using rAF for smooth rate scaling
  useEffect(() => {
    if (countdown !== null) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const elapsed = elapsedRef.current;
      // Spawn interval shrinks from 900ms → 380ms over the game
      spawnIntervalRef.current = Math.max(380, 900 - elapsed * 18);
      // Bomb chance grows from 0% → ~22% over the game
      const bombChance = Math.min(0.22, elapsed * 0.008);

      if (now - lastSpawnRef.current >= spawnIntervalRef.current) {
        lastSpawnRef.current = now;
        // Sometimes spawn 2 at once when game gets intense
        const burst = elapsed > 15 && Math.random() < 0.3 ? 2 : 1;

        // Compute safe spawn bounds based on actual play area size
        const area = playAreaRef.current;
        const rect = area?.getBoundingClientRect();
        const aw = rect?.width ?? 360;
        const ah = rect?.height ?? 480;

        setTargets((prev) => {
          const next = [...prev];
          for (let i = 0; i < burst; i++) {
            const isBomb = Math.random() < bombChance;
            const size = isBomb
              ? rand(56, 72)
              : rand(58, 88);
            const lifespan = Math.max(
              750,
              1500 - elapsed * 25
            );
            // Pixel-based safe bounds: keep bubble fully on-screen
            const padX = size / 2 + 6;
            const padY = size / 2 + 6;
            const xPx = rand(padX, Math.max(padX + 1, aw - padX));
            const yPx = rand(padY, Math.max(padY + 1, ah - padY));
            const xPct = (xPx / aw) * 100;
            const yPct = (yPx / ah) * 100;
            next.push({
              id: nextIdRef.current++,
              x: xPct,
              y: yPct,
              size,
              bornAt: now,
              lifespan,
              color: isBomb ? BOMB_COLOR : COLORS[Math.floor(Math.random() * COLORS.length)],
              points: isBomb ? 0 : Math.round(10 + (90 - size) * 0.4 + (1500 - lifespan) * 0.02),
              isBomb,
            });
          }
          // Cap concurrent targets
          return next.slice(-8);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [countdown]);

  // Cleanup expired targets (counts as miss for non-bombs)
  useEffect(() => {
    if (countdown !== null) return;
    const interval = setInterval(() => {
      const now = performance.now();
      setTargets((prev) => {
        const survivors: Target[] = [];
        let expiredNonBomb = 0;
        for (const t of prev) {
          if (now - t.bornAt >= t.lifespan) {
            if (!t.isBomb) expiredNonBomb++;
          } else {
            survivors.push(t);
          }
        }
        if (expiredNonBomb > 0) {
          setMisses((m) => m + expiredNonBomb);
          statsRef.current.misses += expiredNonBomb;
          setCombo(0);
        }
        return survivors;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [countdown]);

  // End game when time runs out
  useEffect(() => {
    if (countdown !== null) return;
    if (timeLeft > 0) return;
    if (finishedRef.current) return;
    finishedRef.current = true;
    sfx.end();
    hapticNotify("success");
    const acc =
      statsRef.current.hits + statsRef.current.misses > 0
        ? statsRef.current.hits /
          (statsRef.current.hits + statsRef.current.misses)
        : 0;
    setTimeout(() => {
      onEnd({
        score: statsRef.current.score,
        hits: statsRef.current.hits,
        misses: statsRef.current.misses,
        bestCombo: statsRef.current.bestCombo,
        accuracy: acc,
      });
    }, 300);
  }, [timeLeft, countdown, onEnd]);

  const addFloater = useCallback(
    (x: number, y: number, text: string, color: string) => {
      const id = floaterIdRef.current++;
      setFloaters((f) => [...f, { id, x, y, text, color }]);
      setTimeout(() => {
        setFloaters((f) => f.filter((it) => it.id !== id));
      }, 700);
    },
    []
  );

  const handleTargetClick = useCallback(
    (t: Target, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      if (t.isBomb) {
        // Bomb penalty
        sfx.miss();
        hapticNotify("error");
        setScore((s) => Math.max(0, s - 15));
        statsRef.current.score = Math.max(0, statsRef.current.score - 15);
        setMisses((m) => m + 1);
        statsRef.current.misses += 1;
        setCombo(0);
        setShakeKey((k) => k + 1);
        addFloater(t.x, t.y, "-15", "#ff5e7e");
      } else {
        sfx.score();
        haptic("light");
        const newCombo = combo + 1;
        const comboBonus = Math.floor(newCombo / 5) * 5;
        const earned = t.points + comboBonus;
        setScore((s) => s + earned);
        statsRef.current.score += earned;
        setHits((h) => h + 1);
        statsRef.current.hits += 1;
        setCombo(newCombo);
        if (newCombo > statsRef.current.bestCombo) {
          statsRef.current.bestCombo = newCombo;
          setBestCombo(newCombo);
        }
        if (newCombo > 0 && newCombo % 5 === 0) {
          sfx.combo();
          haptic("medium");
          addFloater(t.x, t.y, `COMBO x${newCombo}!`, "#fde047");
        } else {
          addFloater(t.x, t.y, `+${earned}`, t.color);
        }
      }
      setTargets((prev) => prev.filter((it) => it.id !== t.id));
    },
    [combo, addFloater]
  );

  const handleAreaClick = useCallback(() => {
    // Tapping empty space = small miss penalty
    sfx.miss();
    haptic("rigid");
    setCombo(0);
    setMisses((m) => m + 1);
    statsRef.current.misses += 1;
  }, []);

  const accuracy = useMemo(() => {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }, [hits, misses]);

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0f] text-white select-none">
      {/* HUD */}
      <div className="z-20 flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur active:scale-95"
          aria-label="Exit"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-1 items-center justify-center gap-3">
          <Stat label="TIME" value={`${Math.ceil(timeLeft)}s`} highlight={timeLeft <= 5} />
          <Stat label="SCORE" value={String(score)} />
          <Stat label="COMBO" value={`x${combo}`} highlight={combo >= 5} />
        </div>
        <div className="h-9 w-9" />
      </div>

      {/* Progress bar */}
      <div className="z-20 mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
            timeLeft <= 5 ? "bg-rose-500" : "bg-emerald-400"
          }`}
          style={{ width: `${(timeLeft / duration) * 100}%` }}
        />
      </div>

      {/* Accuracy badge */}
      <div className="z-20 mb-1 px-4 text-center text-[11px] font-medium uppercase tracking-widest text-white/40">
        Accuracy {Math.round(accuracy * 100)}% · Best combo x{bestCombo}
      </div>

      {/* Play area */}
      <div
        ref={playAreaRef}
        onClick={handleAreaClick}
        key={shakeKey}
        className="relative flex-1 overflow-hidden touch-none"
        style={{
          animation: shakeKey ? "shake 0.32s ease-in-out" : undefined,
        }}
      >
        {targets.map((t) => (
          <TargetBubble key={t.id} target={t} onHit={handleTargetClick} />
        ))}

        {/* Floating score indicators */}
        {floaters.map((f) => (
          <span
            key={f.id}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 text-2xl font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              color: f.color,
              animation: "floatUp 0.7s ease-out forwards",
            }}
          >
            {f.text}
          </span>
        ))}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0a0a0f]/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                Get Ready
              </div>
              <div
                key={countdown}
                className="text-8xl font-black tabular-nums"
                style={{ animation: "popIn 0.5s ease-out" }}
              >
                {countdown === 0 ? "GO!" : countdown}
              </div>
              <div className="text-sm text-white/50">
                Tap the colored bubbles, avoid the dark bombs.
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes floatUp {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.6); }
          20% { opacity: 1; transform: translate(-50%, -60%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -120%) scale(1); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.4); }
          60% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bubbleIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          70% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes pulseWarn {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 94, 126, 0.5); }
          50% { box-shadow: 0 0 0 8px rgba(255, 94, 126, 0); }
        }
      `}</style>
    </div>
  );
}

function TargetBubble({
  target,
  onHit,
}: {
  target: Target;
  onHit: (t: Target, e: React.MouseEvent | React.TouchEvent) => void;
}) {
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const warnAt = target.lifespan * 0.55;
    const id = setInterval(() => {
      setUrgent(performance.now() - start >= warnAt);
    }, 80);
    return () => clearInterval(id);
  }, [target.lifespan]);

  const now = performance.now();
  const age = now - target.bornAt;
  const lifeFrac = Math.min(1, age / target.lifespan);

  return (
    <button
      onClick={(e) => onHit(target, e)}
      onTouchStart={(e) => onHit(target, e)}
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer touch-none rounded-full"
      style={{
        left: `${target.x}%`,
        top: `${target.y}%`,
        width: target.size,
        height: target.size,
        background: target.isBomb
          ? "radial-gradient(circle at 35% 30%, #3a3a4e 0%, #15151f 70%)"
          : `radial-gradient(circle at 35% 30%, ${lighten(target.color, 0.35)} 0%, ${target.color} 65%)`,
        boxShadow: target.isBomb
          ? "0 6px 18px rgba(0,0,0,0.55), inset 0 0 12px rgba(255,255,255,0.06)"
          : `0 6px 18px ${hexA(target.color, 0.55)}, inset 0 -6px 12px rgba(0,0,0,0.18)`,
        border: target.isBomb
          ? "2px solid rgba(255,255,255,0.18)"
          : "2px solid rgba(255,255,255,0.55)",
        animation: "bubbleIn 0.18s ease-out",
        animationFillMode: "both",
      }}
      aria-label={target.isBomb ? "Bomb, do not tap" : "Target"}
    >
      {/* Lifespan ring */}
      <svg
        className="absolute inset-0 h-full w-full -rotate-90"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={urgent ? "#ff5e7e" : "rgba(255,255,255,0.85)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 46}
          strokeDashoffset={2 * Math.PI * 46 * (1 - lifeFrac)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      {target.isBomb && (
        <span
          className="absolute inset-0 flex items-center justify-center text-2xl"
          style={{ animation: urgent ? "pulseWarn 0.5s ease-in-out infinite" : undefined }}
        >
          💣
        </span>
      )}
    </button>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
        {label}
      </div>
      <div
        className={`text-lg font-black tabular-nums ${
          highlight ? "text-rose-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ---------- color helpers ---------- */
function hexA(hex: string, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function lighten(hex: string, amount: number) {
  const { r, g, b } = parseHex(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}
function parseHex(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
