import type { Game, GameState, GameTeam, Scoreboard } from "../../shared/types.ts";
import type { EspnCompetitor, EspnEvent, EspnScoreboard } from "./espnTypes.ts";

export function normalizeScoreboard(raw: EspnScoreboard): Scoreboard {
  const games = (raw.events ?? [])
    .map(normalizeGame)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  return {
    season: raw.season?.year ?? 0,
    seasonType: raw.season?.type ?? 2,
    week: raw.week?.number ?? 0,
    games,
    byeTeamIds: (raw.week?.teamsOnBye ?? []).map((team) => team.id),
  };
}

function normalizeGame(event: EspnEvent): Game {
  const competition = event.competitions[0];
  const status = competition.status ?? event.status;
  const state = toState(status?.type.state);
  const live = state === "in";
  const situation = live ? competition.situation : undefined;
  const side = (homeAway: "home" | "away") => {
    const competitor = competition.competitors.find((c) => c.homeAway === homeAway);
    if (!competitor) throw new Error(`Game ${event.id} has no ${homeAway} team`);
    return normalizeTeam(competitor);
  };
  return {
    id: event.id,
    startTime: event.date,
    state,
    quarter: state === "pre" ? null : (status?.period ?? null),
    clock: live ? (status?.displayClock ?? null) : null,
    detail: status?.type.shortDetail ?? status?.type.detail ?? "",
    home: side("home"),
    away: side("away"),
    possessionTeamId: situation?.possession || null,
    isRedZone: situation?.isRedZone === true,
    downDistance: situation?.downDistanceText || null,
    lastPlay: competition.situation?.lastPlay?.text?.trim() || null,
  };
}

function normalizeTeam(competitor: EspnCompetitor): GameTeam {
  const { team } = competitor;
  return {
    id: team.id,
    abbreviation: team.abbreviation,
    name: team.displayName ?? team.abbreviation,
    score: Number(competitor.score ?? 0) || 0,
    logo: team.logo ?? "",
    record: competitor.records?.find((r) => r.type === "total")?.summary ?? null,
  };
}

function toState(state: string | undefined): GameState {
  return state === "in" || state === "post" ? state : "pre";
}
