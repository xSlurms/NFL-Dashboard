// Types the UI sees. ESPN's raw shapes stay in src/server/espn/.

/** A lost fumble is tagged FUMBLE_LOST only; FUMBLE means the fumbling team kept the ball. */
export type BigPlayTag = "TD" | "LONG_RUSH" | "LONG_CATCH" | "INT" | "PICK_SIX" | "FUMBLE" | "FUMBLE_LOST" | "FG" | "FG_MISS";

export interface PlayerRef {
  espnId: string;
  name: string;
  position: string;
  team: string; // abbreviation, e.g. "ATL"
  teamId: string; // ESPN team ID, same as fantasy proTeamId
}

export interface SecondaryPlayer {
  espnId: string;
  name: string;
  role: string; // passer, receiver, rusher, returner, fumbler, recoverer, forcedBy, scorer
  teamId: string;
}

export interface BigPlay {
  id: string; // ESPN play id
  gameId: string;
  tags: BigPlayTag[];
  primaryPlayer: PlayerRef | null;
  secondaryPlayers: SecondaryPlayer[];
  /** Team whose D/ST gets credit: the intercepting or recovering team, or the team scoring a return or defensive TD. */
  defenseTeamId: string | null;
  yards: number | null; // run or catch yards, return yards for INTs and return TDs, distance for FGs
  description: string; // short note for the ticker
  rawText: string; // ESPN's full play text
  quarter: number; // 5 = overtime
  clock: string;
  wallclock: string | null; // real-world time of the play (ISO), for ordering plays across games
  scoreAfter: { home: number; away: number };
  status: "active" | "overturned";
  fantasyOwner: "me" | "opponent" | "other" | null; // set after the detector, from the matchup rosters
}

// ---- /api/scoreboard ----

export type GameState = "pre" | "in" | "post";

export interface GameTeam {
  id: string; // ESPN team ID, same as fantasy proTeamId
  abbreviation: string;
  name: string;
  score: number;
  logo: string;
  record: string | null; // e.g. "6-1"
}

export interface Game {
  id: string;
  startTime: string; // ISO
  state: GameState; // halftime is "in"
  quarter: number | null; // null before kickoff, 5 = overtime
  clock: string | null; // null unless in progress
  detail: string; // ESPN's short status: "6:00 - 2nd", "Halftime", "Final", "11/12 - 8:15 PM EST"
  home: GameTeam;
  away: GameTeam;
  /** ESPN drops this between possessions; the browser should keep the last known value. */
  possessionTeamId: string | null;
  isRedZone: boolean;
  downDistance: string | null; // e.g. "3rd & 4 at BUF 10"
  lastPlay: string | null;
}

export interface Scoreboard {
  season: number;
  seasonType: number; // 1 preseason, 2 regular, 3 postseason
  week: number;
  games: Game[];
  byeTeamIds: string[];
}

// ---- /api/plays ----

export interface GamePlays {
  gameId: string;
  plays: BigPlay[];
  /** False when the core play list couldn't be fetched: plays still appear, named from the play text where possible. */
  playersFromCoreApi: boolean;
}

export interface PlaysResponse {
  games: GamePlays[];
  errors: { gameId: string; message: string }[];
}

// ---- /api/fantasy ----

export type LineupSlot = "QB" | "RB" | "WR" | "TE" | "FLEX" | "D/ST" | "K" | "BE" | "IR";

export interface RosterSlot {
  slot: LineupSlot;
  espnId: string; // NFL athlete ID; D/ST is -16000 - proTeamId
  name: string;
  position: string; // QB, RB, WR, TE, K, D/ST
  proTeamId: string; // "0" for a free agent; game status comes from joining with the scoreboard
  proTeam: string; // abbreviation, "FA" for a free agent
  points: number; // live
  projectedPoints: number | null; // ESPN's pre-game projection for the week
}

export interface FantasyTeam {
  teamId: number;
  name: string;
  abbrev: string;
  logo: string | null;
  totalPoints: number; // live
  projectedPoints: number | null; // live points + remaining projections
  winProbability: number | null; // 0-1
  starters: RosterSlot[]; // lineup order: QB, RB, RB, WR, WR, TE, FLEX, D/ST, K
  bench: RosterSlot[];
}

export interface FantasyMatchup {
  leagueId: string;
  season: number;
  week: number;
  me: FantasyTeam;
  opponent: FantasyTeam | null; // null on a bye week or after elimination
}

// ---- errors from any endpoint ----

export type ApiErrorCode = "bad_request" | "method_not_allowed" | "config" | "espn_auth" | "upstream";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
