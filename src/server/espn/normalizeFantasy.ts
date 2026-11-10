import type { FantasyMatchup, FantasyTeam, LineupSlot, RosterSlot } from "../../shared/types.ts";
import type { EspnFantasyLeague, EspnFantasyRosterEntry, EspnFantasySide } from "./espnTypes.ts";

// ESPN team IDs; fantasy proTeamId uses the same numbers. 0 is a free agent.
export const PRO_TEAMS: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
  11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
  21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX",
  33: "BAL", 34: "HOU",
};

const SLOTS: Record<number, LineupSlot> = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "BE", 21: "IR", 23: "FLEX" };
const STARTER_ORDER: LineupSlot[] = ["QB", "RB", "WR", "TE", "FLEX", "D/ST", "K"];
const POSITIONS: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };

const PROJECTION = 1;

export interface FantasyTarget {
  leagueId: string;
  teamId: number;
  week: number; // scoring period
  matchupPeriod: number;
}

/** Builds the matchup from the live views. Only fields listed in the shared types leave this function; nothing else in ESPN's payload does. */
export function normalizeFantasy(raw: EspnFantasyLeague, target: FantasyTarget): FantasyMatchup {
  const matchup = (raw.schedule ?? []).find(
    (m) => m.matchupPeriodId === target.matchupPeriod && (m.home?.teamId === target.teamId || m.away?.teamId === target.teamId),
  );
  const mine = matchup && (matchup.home?.teamId === target.teamId ? matchup.home : matchup.away);
  const theirs = matchup && (mine === matchup.home ? matchup.away : matchup.home);
  return {
    leagueId: target.leagueId,
    season: raw.seasonId ?? 0,
    week: target.week,
    me: normalizeTeam(raw, target.teamId, mine, target.week),
    opponent: theirs ? normalizeTeam(raw, theirs.teamId, theirs, target.week) : null,
  };
}

function normalizeTeam(raw: EspnFantasyLeague, teamId: number, side: EspnFantasySide | undefined, week: number): FantasyTeam {
  const info = raw.teams?.find((t) => t.id === teamId);
  const roster = (side?.rosterForCurrentScoringPeriod?.entries ?? []).map((entry) => normalizeSlot(entry, week));
  const starters = roster
    .filter((r) => r.slot !== "BE" && r.slot !== "IR")
    .sort((a, b) => STARTER_ORDER.indexOf(a.slot) - STARTER_ORDER.indexOf(b.slot));
  const bench = roster.filter((r) => r.slot === "BE" || r.slot === "IR").sort((a, b) => (a.slot === b.slot ? 0 : a.slot === "BE" ? -1 : 1));
  return {
    teamId,
    name: info?.name ?? `Team ${teamId}`,
    abbrev: info?.abbrev ?? "",
    logo: info?.logo ?? null,
    totalPoints: round(side?.totalPointsLive ?? side?.totalPoints ?? 0),
    projectedPoints: nullableRound(side?.totalProjectedPointsLive ?? side?.totalProjectedPoints),
    winProbability: side?.winProbability ?? null,
    starters,
    bench,
  };
}

function normalizeSlot(entry: EspnFantasyRosterEntry, week: number): RosterSlot {
  const player = entry.playerPoolEntry?.player;
  const proTeamId = player?.proTeamId ?? 0;
  const projection = player?.stats?.find((s) => s.statSourceId === PROJECTION && s.scoringPeriodId === week);
  return {
    // Slot IDs this league doesn't use (e.g. OP, RB/WR) still count as starters.
    slot: SLOTS[entry.lineupSlotId] ?? "FLEX",
    espnId: String(entry.playerId),
    name: player?.fullName ?? "Unknown player",
    position: POSITIONS[player?.defaultPositionId ?? -1] ?? "",
    proTeamId: String(proTeamId),
    proTeam: PRO_TEAMS[proTeamId] ?? "FA",
    points: round(entry.playerPoolEntry?.appliedStatTotal ?? 0),
    projectedPoints: nullableRound(projection?.appliedTotal),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
const nullableRound = (n: number | undefined) => (n === undefined ? null : round(n));
