"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import { haptic, hapticNotify } from "@/lib/telegram";

export interface GameResult {
  score: number;
  hits: number;
  misses: number;
  bestCombo?: number;
  bestStreak?: number;
  accuracy: number;
}

interface Props {
  mode: "tap" | "color";
  result: GameResult;
  best: number;
  isNewBest: boolean;
  onReplay: () => void;
  onHome: () => void;
}

export default function ResultScreen({
  mode,
  result,
  best,
  isNewBest,
  onReplay,
  onHome,
}: Props) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    // Animated count up
    const target = result.score;
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.score]);

  useEffect(() => {
    if (isNewBest) {
      sfx.combo();
      hapticNotify("success");
    } else {
      haptic("medium");
    }
  }, [isNewBest]);

  const accuracy = Math.round(result.accuracy * 100);
  const bestMetric = result.bestCombo ?? result.bestStreak ?? 0;
  const metricLabel = mode === "tap" ? "Best Combo" : "Best Streak";

  const rating = getRating(result.score);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-[#0a0a0f] px-6 py-8 text-white">
      {/* Glow background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${rating.color}22 0%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-5">
        {/* Rating */}
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: rating.color }}
        >
          {rating.label}
        </div>

        {/* Score */}
        <div className="flex flex-col items-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/40">
            Final Score
          </div>
          <div
            className="text-7xl font-black tabular-nums"
            style={{ color: rating.color, textShadow: `0 0 30px ${rating.color}66` }}
          >
            {displayScore}
          </div>
        </div>

        {/* New best badge */}
        {isNewBest && (
          <div
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold"
            style={{
              background: "linear-gradient(90deg, #fde047, #f97316)",
              color: "#0a0a0f",
              animation: "popIn 0.4s ease-out",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.39 7.36H22l-6.18 4.49L18.21 21 12 16.51 5.79 21l2.39-7.15L2 9.36h7.61L12 2z" />
            </svg>
            NEW BEST!
          </div>
        )}

        {/* Stats grid */}
        <div className="grid w-full grid-cols-2 gap-2.5">
          <StatCard label="Hits" value={String(result.hits)} color="#4ade80" />
          <StatCard label="Misses" value={String(result.misses)} color="#ff5e7e" />
          <StatCard label="Accuracy" value={`${accuracy}%`} color="#38bdf8" />
          <StatCard label={metricLabel} value={`x${bestMetric}`} color="#c084fc" />
        </div>

        {/* Best score */}
        <div className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Personal Best
          </span>
          <span className="text-xl font-black tabular-nums text-white">
            {best}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <button
            onClick={onReplay}
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 text-base font-black uppercase tracking-wider text-[#0a0a0f] transition-all active:scale-[0.98]"
            style={{ boxShadow: "0 8px 24px rgba(74,222,128,0.35)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-active:rotate-180"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Play Again
          </button>
          <button
            onClick={() => {
              sfx.tick();
              haptic("light");
              onHome();
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold uppercase tracking-wider text-white/80 transition-all active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
            Game Hub
          </button>
        </div>

        {/* Share hint */}
        <div className="mt-2 rounded-xl bg-white/[0.03] px-4 py-2.5 text-center text-xs text-white/40">
          Challenge a friend in any Telegram chat by typing{" "}
          <span className="font-mono text-white/70">@your_bot</span> → send this game.
        </div>
      </div>

      <style jsx>{`
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.4); }
          60% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
        {label}
      </div>
      <div
        className="mt-0.5 text-2xl font-black tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function getRating(score: number): { label: string; color: string } {
  if (score >= 600) return { label: "LEGENDARY", color: "#fde047" };
  if (score >= 400) return { label: "EXPERT", color: "#c084fc" };
  if (score >= 250) return { label: "GREAT", color: "#38bdf8" };
  if (score >= 120) return { label: "GOOD", color: "#4ade80" };
  if (score >= 50) return { label: "WARMING UP", color: "#ffb547" };
  return { label: "KEEP TRYING", color: "#ff5e7e" };
}
