"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { haptic, hapticNotify } from "@/lib/telegram";

export interface ColorMatchResult {
  score: number;
  hits: number;
  misses: number;
  bestStreak: number;
  accuracy: number;
}

interface Round {
  id: number;
  promptColor: string; // color user must look for
  promptName: string;
  tiles: Tile[];
  matchIndices: number[]; // indices of tiles whose color == promptColor
  spawnedAt: number;
  lifespan: number;
}

interface Tile {
  color: string;
  name: string;
}

interface Props {
  duration?: number;
  onEnd: (result: ColorMatchResult) => void;
  onExit: () => void;
}

const PALETTE: { name: string; color: string }[] = [
  { name: "Red", color: "#ef4444" },
  { name: "Orange", color: "#f97316" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Yellow", color: "#eab308" },
  { name: "Lime", color: "#84cc16" },
  { name: "Green", color: "#22c55e" },
  { name: "Emerald", color: "#10b981" },
  { name: "Teal", color: "#14b8a6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Sky", color: "#0ea5e9" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Violet", color: "#8b5cf6" },
  { name: "Purple", color: "#a855f7" },
  { name: "Pink", color: "#ec4899" },
  { name: "Rose", color: "#f43f5e" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPrompt(exclude?: string) {
  let p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  while (p.color === exclude) {
    p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }
  return p;
}

function makeRound(id: number, elapsed: number): Round {
  const prompt = pickPrompt();
  // Grid size grows over time: starts 2x2 → max 4x4
  const cols = elapsed < 10 ? 2 : elapsed < 20 ? 3 : 4;
  const total = cols * cols;
  // Match count: 1-3 tiles depending on grid
  const matchCount = Math.min(
    total - 1,
    1 + Math.floor(Math.random() * Math.min(3, total - 1))
  );

  // Build tile list: matchCount of prompt, rest from other colors
  const others = shuffle(PALETTE.filter((p) => p.color !== prompt.color));
  const tiles: Tile[] = [];
  for (let i = 0; i < matchCount; i++) tiles.push({ ...prompt });
  for (let i = 0; i < total - matchCount; i++) {
    tiles.push(others[i % others.length]);
  }
  const shuffledTiles = shuffle(tiles);
  const matchIndices = shuffledTiles
    .map((t, i) => (t.color === prompt.color ? i : -1))
    .filter((i) => i >= 0);

  const lifespan = Math.max(1800, 4200 - elapsed * 60);
  return {
    id,
    promptColor: prompt.color,
    promptName: prompt.name,
    tiles: shuffledTiles,
    matchIndices,
    spawnedAt: performance.now(),
    lifespan,
  };
}

export default function ColorMatchGame({
  duration = 30,
  onEnd,
  onExit,
}: Props) {
  const [round, setRound] = useState<Round | null>(null);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [floaters, setFloaters] = useState<
    { id: number; x: number; y: number; text: string; color: string }[]
  >([]);
  const [tappedTiles, setTappedTiles] = useState<Set<number>>(new Set());
  const [shakeKey, setShakeKey] = useState(0);
  const [flash, setFlash] = useState<"none" | "good" | "bad">("none");

  const startTimeRef = useRef<number>(0);
  const nextRoundIdRef = useRef(1);
  const floaterIdRef = useRef(1);
  const elapsedRef = useRef(0);
  const statsRef = useRef({ score: 0, hits: 0, misses: 0, bestStreak: 0 });
  const finishedRef = useRef(false);
  const playAreaRef = useRef<HTMLDivElement>(null);

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      sfx.go();
      haptic("medium");
      // Defer state updates to avoid cascading renders inside effect body
      queueMicrotask(() => {
        setCountdown(null);
        startTimeRef.current = performance.now();
        setRound(makeRound(nextRoundIdRef.current++, 0));
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
      setTimeLeft(Math.max(0, duration - elapsed));
    }, 100);
    return () => clearInterval(interval);
  }, [countdown, duration]);

  // Round expiry
  useEffect(() => {
    if (!round || countdown !== null) return;
    const remaining = round.lifespan - (performance.now() - round.spawnedAt);
    if (remaining <= 0) return;
    const id = setTimeout(() => {
      // Round timed out — counts as miss
      sfx.miss();
      hapticNotify("warning");
      setMisses((m) => m + 1);
      statsRef.current.misses += 1;
      setStreak(0);
      setFlash("bad");
      setTimeout(() => setFlash("none"), 240);
      setRound(makeRound(nextRoundIdRef.current++, elapsedRef.current));
      setTappedTiles(new Set());
    }, remaining);
    return () => clearTimeout(id);
  }, [round, countdown]);

  // End game
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
        bestStreak: statsRef.current.bestStreak,
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
      }, 800);
    },
    []
  );

  const advance = useCallback(() => {
    setRound(makeRound(nextRoundIdRef.current++, elapsedRef.current));
    setTappedTiles(new Set());
  }, []);

  const handleTile = useCallback(
    (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
      if (!round) return;
      if (tappedTiles.has(idx)) return;

      // Position relative to play area for floater
      const rect = playAreaRef.current?.getBoundingClientRect();
      const btn = e.currentTarget.getBoundingClientRect();
      const fx = rect ? ((btn.left + btn.width / 2 - rect.left) / rect.width) * 100 : 50;
      const fy = rect ? ((btn.top + btn.height / 2 - rect.top) / rect.height) * 100 : 50;

      const isMatch = round.matchIndices.includes(idx);
      const newTapped = new Set(tappedTiles);
      newTapped.add(idx);
      setTappedTiles(newTapped);

      if (isMatch) {
        sfx.score();
        haptic("light");
        const earned = 10 + streak * 2;
        setScore((s) => s + earned);
        statsRef.current.score += earned;
        setHits((h) => h + 1);
        statsRef.current.hits += 1;
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak > statsRef.current.bestStreak) {
          statsRef.current.bestStreak = newStreak;
          setBestStreak(newStreak);
        }
        addFloater(fx, fy, `+${earned}`, round.promptColor);
      } else {
        sfx.miss();
        hapticNotify("error");
        setScore((s) => Math.max(0, s - 8));
        statsRef.current.score = Math.max(0, statsRef.current.score - 8);
        setMisses((m) => m + 1);
        statsRef.current.misses += 1;
        setStreak(0);
        setShakeKey((k) => k + 1);
        setFlash("bad");
        setTimeout(() => setFlash("none"), 240);
        addFloater(fx, fy, "-8", "#ff5e7e");
      }

      // If all matches tapped, advance
      const allMatched = round.matchIndices.every((i) => newTapped.has(i));
      if (allMatched) {
        sfx.combo();
        haptic("medium");
        const bonus = 5 + streak * 3;
        setScore((s) => s + bonus);
        statsRef.current.score += bonus;
        addFloater(50, 50, `ROUND CLEAR +${bonus}`, "#fde047");
        setTimeout(advance, 350);
      }
    },
    [round, tappedTiles, streak, advance, addFloater]
  );

  const accuracy = useMemo(() => {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }, [hits, misses]);

  const cols = round
    ? round.tiles.length === 4
      ? 2
      : round.tiles.length === 9
      ? 3
      : 4
    : 2;

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
          <Stat label="STREAK" value={`x${streak}`} highlight={streak >= 3} />
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

      <div className="z-20 mb-2 px-4 text-center text-[11px] font-medium uppercase tracking-widest text-white/40">
        Accuracy {Math.round(accuracy * 100)}% · Best streak x{bestStreak}
      </div>

      {/* Prompt */}
      <div className="z-20 flex flex-col items-center gap-2 px-4 pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">
          Tap all tiles that are
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-5 py-1.5"
          style={{
            background: round ? `${round.promptColor}22` : "transparent",
            border: `1.5px solid ${round ? round.promptColor : "transparent"}`,
          }}
        >
          <span
            className="h-4 w-4 rounded-full"
            style={{
              background: round?.promptColor,
              boxShadow: round ? `0 0 12px ${round.promptColor}` : undefined,
            }}
          />
          <span
            className="text-lg font-black tracking-wide"
            style={{ color: round?.promptColor }}
          >
            {round?.promptName ?? "—"}
          </span>
        </div>
      </div>

      {/* Play area */}
      <div
        ref={playAreaRef}
        key={shakeKey}
        className={`relative flex-1 overflow-hidden px-4 pb-4 transition-colors duration-150 ${
          flash === "bad" ? "bg-rose-500/10" : flash === "good" ? "bg-emerald-500/10" : ""
        }`}
        style={{
          animation: shakeKey ? "shake 0.32s ease-in-out" : undefined,
        }}
      >
        {round && (
          <div
            className="mx-auto grid h-full max-w-md gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: "1fr",
            }}
          >
            {round.tiles.map((t, i) => {
              const isMatch = round.matchIndices.includes(i);
              const tapped = tappedTiles.has(i);
              return (
                <button
                  key={`${round.id}-${i}`}
                  onClick={(e) => handleTile(i, e)}
                  disabled={tapped}
                  className="relative flex items-center justify-center rounded-2xl transition-all duration-150 active:scale-95"
                  style={{
                    background: tapped
                      ? isMatch
                        ? `${t.color}`
                        : "rgba(239,68,68,0.18)"
                      : `linear-gradient(145deg, ${lighten(t.color, 0.18)} 0%, ${t.color} 100%)`,
                    boxShadow: tapped
                      ? isMatch
                        ? `0 0 0 2px rgba(255,255,255,0.6), 0 0 18px ${t.color}`
                        : "inset 0 0 0 2px #ef4444"
                      : `0 4px 14px ${hexA(t.color, 0.4)}`,
                    opacity: tapped && !isMatch ? 0.45 : 1,
                  }}
                  aria-label={`Tile ${i + 1}, color ${t.name}`}
                >
                  {tapped && isMatch && (
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
                        animation: "popIn 0.25s ease-out",
                      }}
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                  {tapped && !isMatch && (
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Floating indicators */}
        {floaters.map((f) => (
          <span
            key={f.id}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 text-xl font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              color: f.color,
              animation: "floatUp 0.8s ease-out forwards",
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
              <div className="px-6 text-center text-sm text-white/50">
                Tap every tile that matches the prompt color. Wrong tile = penalty.
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
      `}</style>
    </div>
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
          highlight ? "text-amber-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

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
