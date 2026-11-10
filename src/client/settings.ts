import { DEFAULT_RULES, type BigPlayRules } from "../shared/bigPlayRules.ts";

export type TickerFilter = "all" | "matchup" | "mine";
export const POLL_CHOICES = [10, 15, 30, 60] as const;

export interface Settings {
  rules: BigPlayRules;
  pollSeconds: (typeof POLL_CHOICES)[number];
  notifications: boolean;
  sound: boolean;
  tickerFilter: TickerFilter;
}

export const DEFAULT_SETTINGS: Settings = {
  rules: DEFAULT_RULES,
  pollSeconds: 15,
  notifications: false,
  sound: false,
  tickerFilter: "all",
};

const KEY = "football-tracker:settings";

/** Anything missing or out of range falls back to the default, so old or hand-edited storage can't break the page. */
export function parseSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const r = (s.rules && typeof s.rules === "object" ? s.rules : {}) as Record<string, any>;
  const yards = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 99 ? (v as number) : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    rules: {
      longRushYards: yards(r.longRushYards, DEFAULT_RULES.longRushYards),
      longCatchYards: yards(r.longCatchYards, DEFAULT_RULES.longCatchYards),
      fumbles: ["all", "lost", "none"].includes(r.fumbles) ? r.fumbles : DEFAULT_RULES.fumbles,
      fieldGoals: {
        made: bool(r.fieldGoals?.made, DEFAULT_RULES.fieldGoals.made),
        missed: bool(r.fieldGoals?.missed, DEFAULT_RULES.fieldGoals.missed),
      },
    },
    pollSeconds: (POLL_CHOICES as readonly number[]).includes(s.pollSeconds) ? s.pollSeconds : DEFAULT_SETTINGS.pollSeconds,
    notifications: bool(s.notifications, false),
    sound: bool(s.sound, false),
    tickerFilter: ["all", "matchup", "mine"].includes(s.tickerFilter) ? s.tickerFilter : "all",
  };
}

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(KEY);
    return parseSettings(text ? JSON.parse(text) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private window or blocked storage: settings last for this visit only.
  }
}
