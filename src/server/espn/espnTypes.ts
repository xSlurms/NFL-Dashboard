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
}
