import { DEFAULT_RULES, type BigPlayRules } from "../shared/bigPlayRules.ts";
import { MAX_TEAMS, toSavedTeam, type SavedTeam } from "./teamUrl.ts";

export type TickerFilter = "all" | "matchup" | "mine";
export const POLL_CHOICES = [10, 15, 30, 60] as const;

export interface Settings {
  rules: BigPlayRules;
  pollSeconds: (typeof POLL_CHOICES)[number];
  notifications: boolean;
  sound: boolean;
  tickerFilter: TickerFilter;
  /** Teams in the tabs. Empty until one is added: there is no default team. Private leagues carry their cookies. */
  teams: SavedTeam[];
  /** Key of the selected tab. */
  activeTeam: string | null;
}

/** Adds a team, or replaces the saved one with the same league/team/season (an edit), and selects it. */
export function saveTeam(settings: Settings, team: SavedTeam): Settings {
  let teams = [...settings.teams];
  const at = teams.findIndex((t) => t.key === team.key);
  if (at >= 0) teams[at] = team;
  else teams = [...teams, team].slice(-MAX_TEAMS);
  return { ...settings, teams, activeTeam: team.key };
}

export function removeTeam(settings: Settings, key: string): Settings {
  const teams = settings.teams.filter((t) => t.key !== key);
  const activeTeam = settings.activeTeam === key ? (teams[0]?.key ?? null) : settings.activeTeam;
  return { ...settings, teams, activeTeam };
}

/** Keeps a tab's label in step with the team's name on ESPN. Returns the same object when nothing changed. */
export function nameTeam(settings: Settings, key: string, name: string): Settings {
  const team = settings.teams.find((t) => t.key === key);
  if (!team || team.name === name) return settings;
  return { ...settings, teams: settings.teams.map((t) => (t.key === key ? { ...t, name } : t)) };
}

/** The team whose matchup is shown, or null before any team is added. */
export function activeTeamOf(settings: Settings): SavedTeam | null {
  return settings.teams.find((t) => t.key === settings.activeTeam) ?? settings.teams[0] ?? null;
}

export const DEFAULT_SETTINGS: Settings = {
  rules: DEFAULT_RULES,
  pollSeconds: 15,
  notifications: false,
  sound: false,
  tickerFilter: "all",
  teams: [],
  activeTeam: null,
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
    ...parseTeams(s),
  };
}

function parseTeams(s: Record<string, any>): Pick<Settings, "teams" | "activeTeam"> {
  // Earlier builds kept a single `team`; it becomes the first tab.
  const raw: unknown[] = Array.isArray(s.teams) ? s.teams : s.team ? [s.team] : [];
  const teams: SavedTeam[] = [];
  for (const value of raw) {
    const team = toSavedTeam(value);
    if (team && !teams.some((t) => t.key === team.key) && teams.length < MAX_TEAMS) teams.push(team);
  }
  const activeTeam = teams.some((t) => t.key === s.activeTeam) ? (s.activeTeam as string) : (teams[0]?.key ?? null);
  return { teams, activeTeam };
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
