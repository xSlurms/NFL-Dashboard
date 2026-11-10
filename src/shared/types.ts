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
  scoreAfter: { home: number; away: number };
  status: "active" | "overturned";
  fantasyOwner: "me" | "opponent" | "other" | null; // set after the detector, from the matchup rosters
}

// Draft shapes for Phase 2. Expect them to change once the functions exist.

export type GameState = "pre" | "in" | "post";

export interface GameTeam {
  id: string;
  abbreviation: string;
  name: string;
  score: number;
  logo: string;
}

export interface Game {
  id: string;
  startTime: string;
  state: GameState;
  quarter: number | null;
  clock: string | null;
  detail: string; // e.g. "0:05 - 2nd"
  home: GameTeam;
  away: GameTeam;
  possessionTeamId: string | null;
  isRedZone: boolean;
  downDistance: string | null;
}

export type LineupSlot = "QB" | "RB" | "WR" | "TE" | "FLEX" | "D/ST" | "K" | "BE" | "IR";

export interface RosterSlot {
  slot: LineupSlot;
  espnId: string; // negative for D/ST
  name: string;
  position: string;
  proTeamId: string;
  proTeam: string;
  gameState: GameState | "bye";
  points: number;
  projectedPoints: number | null;
}

export interface FantasyTeam {
  teamId: number;
  name: string;
  abbrev: string;
  totalPoints: number;
  projectedPoints: number | null;
  winProbability: number | null;
  starters: RosterSlot[];
  bench: RosterSlot[];
}

export interface FantasyMatchup {
  week: number;
  me: FantasyTeam;
  opponent: FantasyTeam;
}
