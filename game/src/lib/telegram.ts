/**
 * Telegram WebApp API helpers.
 * Safely no-ops when not running inside Telegram (e.g. regular browser preview),
 * so the game is fully playable anywhere.
 */

type TgHapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type TgNotifyType = "error" | "success" | "warning";

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback?: {
    impactOccurred: (style: TgHapticStyle) => void;
    notificationOccurred: (type: TgNotifyType) => void;
    selectionChanged: () => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

export function initTelegram() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("#0a0a0f");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#0a0a0f");
  } catch {
    // ignore — older clients may not support these calls
  }
}

export function haptic(style: TgHapticStyle = "light") {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
  } catch {
    // ignore
  }
}

export function hapticNotify(type: TgNotifyType) {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // ignore
  }
}

export function hapticSelection() {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
  } catch {
    // ignore
  }
}

export function getTelegramUser(): { name: string; id?: number } | null {
  const tg = getTelegramWebApp();
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  const name =
    [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
    u.username ||
    "Player";
  return { name, id: u.id };
}
