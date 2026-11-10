// The parts of ESPN's undocumented JSON this code reads. See docs/phase0-findings.md.

export interface EspnPlay {
  id: string;
  sequenceNumber?: string;
  type?: { text?: string };
  text?: string;
  awayScore?: number;
  homeScore?: number;
  period?: { number?: number };
  clock?: { displayValue?: string };
  /** Real-world time of the play (ISO). */
  wallclock?: string;
  scoringPlay?: boolean;
  /** For kickoffs and punts this is the kicking team. */
  start?: { team?: { id?: string } };
}

export interface EspnBoxscoreAthlete {
  athlete: { id: string; displayName: string; firstName?: string; lastName?: string };
  stats?: string[];
}

export interface EspnSummary {
  header: {
    id: string;
    competitions: { competitors: { homeAway: "home" | "away"; team: { id: string; abbreviation: string } }[] }[];
  };
  drives?: { previous?: { plays?: EspnPlay[] }[]; current?: { plays?: EspnPlay[] } };
  boxscore?: {
    players?: {
      team: { id: string; abbreviation: string };
      statistics: { name: string; keys?: string[]; athletes: EspnBoxscoreAthlete[] }[];
    }[];
  };
  scoringPlays?: { id: string; scoringType?: { name?: string } }[];
}

export interface EspnCorePlay {
  id: string;
  participants?: { type: string; athlete?: { $ref: string }; position?: { $ref: string } }[];
}

export interface EspnCorePlayList {
  items: EspnCorePlay[];
  pageCount?: number;
}

// ---- Scoreboard (/scoreboard) ----

export interface EspnStatus {
  displayClock?: string;
  period?: number;
  type: { state: string; detail?: string; shortDetail?: string };
}

export interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: { id: string; abbreviation: string; displayName?: string; logo?: string };
  records?: { type?: string; summary?: string }[];
}

export interface EspnEvent {
  id: string;
  date: string;
  status?: EspnStatus;
  competitions: {
    status?: EspnStatus;
    competitors: EspnCompetitor[];
    situation?: {
      possession?: string;
      isRedZone?: boolean;
      downDistanceText?: string;
      lastPlay?: { text?: string };
    };
    /** Pre-game lines. ESPN drops them once the game starts. */
    odds?: EspnOdds[];
  }[];
}

export interface EspnOdds {
  provider?: { id?: string; name?: string };
  details?: string; // the favorite's line, e.g. "NYG -2.5", or "EVEN"
  spread?: number; // from the home team's side
  homeTeamOdds?: { favorite?: boolean };
  awayTeamOdds?: { favorite?: boolean };
}

export interface EspnScoreboard {
  season?: { year?: number; type?: number };
  week?: { number?: number; teamsOnBye?: { id: string }[] };
  events?: EspnEvent[];
}

// ---- Fantasy (lm-api-reads.fantasy.espn.com, views mMatchupScore + mBoxscore) ----

export interface EspnFantasyRosterEntry {
  lineupSlotId: number;
  playerId: number;
  playerPoolEntry?: {
    appliedStatTotal?: number;
    player?: {
      fullName?: string;
      defaultPositionId?: number;
      proTeamId?: number;
      stats?: { statSourceId?: number; scoringPeriodId?: number; appliedTotal?: number }[];
    };
  };
}

export interface EspnFantasySide {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPoints?: number;
  totalProjectedPointsLive?: number;
  winProbability?: number;
  rosterForCurrentScoringPeriod?: { entries?: EspnFantasyRosterEntry[] };
}

export interface EspnFantasyLeague {
  seasonId?: number;
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number };
  teams?: { id: number; name?: string; abbrev?: string; logo?: string }[];
  schedule?: { matchupPeriodId: number; home?: EspnFantasySide; away?: EspnFantasySide }[];
}
