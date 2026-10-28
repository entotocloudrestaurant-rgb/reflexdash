"use client";

import { useCallback, useEffect, useState } from "react";
import TapTargetGame, { type TapTargetResult } from "@/components/games/TapTargetGame";
import ColorMatchGame, { type ColorMatchResult } from "@/components/games/ColorMatchGame";
import ResultScreen, { type GameResult } from "@/components/games/ResultScreen";
import { initTelegram, getTelegramUser, haptic, hapticSelection } from "@/lib/telegram";
import { sfx, setMuted, isMuted } from "@/lib/sound";

type View = "hub" | "tap" | "color" | "result";

const BEST_TAP_KEY = "reflex.best.tap";
const BEST_COLOR_KEY = "reflex.best.color";

function loadBest(key: string): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(key);
  return v ? parseInt(v, 10) || 0 : 0;
}
function saveBest(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

export default function Home() {
  const [view, setView] = useState<View>("hub");
  const [result, setResult] = useState<GameResult | null>(null);
  const [resultMode, setResultMode] = useState<"tap" | "color">("tap");
  const [bestTap, setBestTap] = useState(0);
  const [bestColor, setBestColor] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [playerName, setPlayerName] = useState<string>("Player");

  useEffect(() => {
    initTelegram();
    // Defer to avoid synchronous setState inside the effect body
    queueMicrotask(() => {
      setBestTap(loadBest(BEST_TAP_KEY));
      setBestColor(loadBest(BEST_COLOR_KEY));
      const tgUser = getTelegramUser();
      if (tgUser) setPlayerName(tgUser.name);
    });
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sfx.tick();
  }, [muted]);

  const startGame = useCallback((mode: "tap" | "color") => {
    sfx.start();
    haptic("medium");
    setResultMode(mode);
    setView(mode);
  }, []);

  const handleTapEnd = useCallback(
    (r: TapTargetResult) => {
      const prev = loadBest(BEST_TAP_KEY);
      const newBest = r.score > prev;
      if (newBest) {
        saveBest(BEST_TAP_KEY, r.score);
        setBestTap(r.score);
      }
      setIsNewBest(newBest);
      setResult({
        score: r.score,
        hits: r.hits,
        misses: r.misses,
        bestCombo: r.bestCombo,
        accuracy: r.accuracy,
      });
      setResultMode("tap");
      setView("result");
    },
    []
  );

  const handleColorEnd = useCallback(
    (r: ColorMatchResult) => {
      const prev = loadBest(BEST_COLOR_KEY);
      const newBest = r.score > prev;
      if (newBest) {
        saveBest(BEST_COLOR_KEY, r.score);
        setBestColor(r.score);
      }
      setIsNewBest(newBest);
      setResult({
        score: r.score,
        hits: r.hits,
        misses: r.misses,
        bestStreak: r.bestStreak,
        accuracy: r.accuracy,
      });
      setResultMode("color");
      setView("result");
    },
    []
  );

  const replay = useCallback(() => {
    sfx.start();
    haptic("medium");
    setView(resultMode);
  }, [resultMode]);

  const goHome = useCallback(() => {
    haptic("light");
    setView("hub");
  }, []);

  const exitGame = useCallback(() => {
    haptic("light");
    setView("hub");
  }, []);

  if (view === "tap") {
    return (
      <GameShell>
        <TapTargetGame duration={30} onEnd={handleTapEnd} onExit={exitGame} />
      </GameShell>
    );
  }

  if (view === "color") {
    return (
      <GameShell>
        <ColorMatchGame duration={30} onEnd={handleColorEnd} onExit={exitGame} />
      </GameShell>
    );
  }

  if (view === "result" && result) {
    const best = resultMode === "tap" ? bestTap : bestColor;
    return (
      <GameShell>
        <ResultScreen
          mode={resultMode}
          result={result}
          best={best}
          isNewBest={isNewBest}
          onReplay={replay}
          onHome={goHome}
        />
      </GameShell>
    );
  }

  return (
    <GameShell>
      <Hub
        playerName={playerName}
        bestTap={bestTap}
        bestColor={bestColor}
        muted={muted}
        onToggleMute={toggleMute}
        onPick={startGame}
      />
    </GameShell>
  );
}

/** Full-viewport shell that pins the game to 100dvh and avoids scrollbars. */
function GameShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0a0a0f]">{children}</main>
  );
}

/* ---------------- Hub ---------------- */

interface HubProps {
  playerName: string;
  bestTap: number;
  bestColor: number;
  muted: boolean;
  onToggleMute: () => void;
  onPick: (mode: "tap" | "color") => void;
}

function Hub({
  playerName,
  bestTap,
  bestColor,
  muted,
  onToggleMute,
  onPick,
}: HubProps) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto bg-[#0a0a0f] text-white">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #ff5e7e 0%, transparent 70%)" }}
        />
        <div
          className="absolute -right-32 top-1/3 h-80 w-80 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #38bdf8 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #c084fc 0%, transparent 70%)" }}
        />
      </div>

      {/* Mute button */}
      <button
        onClick={onToggleMute}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 backdrop-blur active:scale-95"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        {/* Header */}
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 via-amber-300 to-emerald-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Reflex<span className="text-rose-400">Dash</span>
          </h1>
          <p className="mt-1.5 text-sm text-white/50">
            Hi {playerName} — pick a game and beat your best.
          </p>
        </div>

        {/* Total best banner */}
        <div className="mt-6 flex items-center justify-center gap-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Tap Best
            </div>
            <div className="text-xl font-black tabular-nums text-rose-400">
              {bestTap}
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Color Best
            </div>
            <div className="text-xl font-black tabular-nums text-sky-400">
              {bestColor}
            </div>
          </div>
        </div>

        {/* Game cards */}
        <div className="mt-6 flex flex-col gap-3">
          <GameCard
            title="Tap the Target"
            tag="30s · reflexes"
            description="Bubbles pop up fast — tap them before they vanish. Watch out for bombs."
            colors={["#ff5e7e", "#ffb547"]}
            best={bestTap}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            }
            onClick={() => {
              hapticSelection();
              onPick("tap");
            }}
          />
          <GameCard
            title="Color Match"
            tag="30s · perception"
            description="Spot every tile that matches the prompt color. Wrong tap costs points."
            colors={["#38bdf8", "#c084fc"]}
            best={bestColor}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            }
            onClick={() => {
              hapticSelection();
              onPick("color");
            }}
          />
        </div>

        {/* Footer hint */}
        <div className="mt-auto pt-6 text-center text-[11px] leading-relaxed text-white/30">
          Tap a card to start · 30-second rounds · Built for Telegram HTML5 Games
        </div>
      </div>
    </div>
  );
}

interface GameCardProps {
  title: string;
  tag: string;
  description: string;
  colors: [string, string];
  best: number;
  icon: React.ReactNode;
  onClick: () => void;
}

function GameCard({
  title,
  tag,
  description,
  colors,
  best,
  icon,
  onClick,
}: GameCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all active:scale-[0.98]"
      style={{
        boxShadow: `0 4px 18px ${colors[0]}22`,
      }}
    >
      {/* Glow strip */}
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: `linear-gradient(180deg, ${colors[0]}, ${colors[1]})` }}
      />
      {/* Icon */}
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`,
          color: "#0a0a0f",
        }}
      >
        {icon}
      </div>
      {/* Text */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
            style={{ background: `${colors[0]}22`, color: colors[0] }}
          >
            {tag}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-white/50">
          {description}
        </p>
        <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Best: <span className="tabular-nums text-white/70">{best}</span>
        </div>
      </div>
      {/* Arrow */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-transform group-active:translate-x-0.5"
        style={{ background: `${colors[0]}22` }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </button>
  );
}
