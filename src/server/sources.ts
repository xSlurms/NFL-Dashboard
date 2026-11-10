// The functions talk to data sources only through these interfaces, so a paid NFL feed or another
// fantasy platform can be swapped in without touching the handlers or the UI.
import type { BigPlayRules } from "../shared/bigPlayRules.ts";
import type { FantasyMatchup, GamePlays, Scoreboard } from "../shared/types.ts";

export interface ScoreboardQuery {
  week?: number;
  seasonType?: number;
}

export interface NflDataSource {
  getScoreboard(query?: ScoreboardQuery): Promise<Scoreboard>;
  getGamePlays(gameId: string, rules: BigPlayRules): Promise<GamePlays>;
}

export interface FantasySource {
  getMatchup(): Promise<FantasyMatchup>;
}

/** The fantasy platform refused the request, e.g. the league went private and the cookies are missing or expired. */
export class FantasyAuthError extends Error {}
