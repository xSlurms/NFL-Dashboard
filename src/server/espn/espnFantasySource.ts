import type { FantasyMatchup } from "../../shared/types.ts";
import { UpstreamError, fetchJson } from "../http.ts";
import { FantasyAuthError, type FantasySource } from "../sources.ts";
import type { EspnFantasyLeague } from "./espnTypes.ts";
import { normalizeFantasy } from "./normalizeFantasy.ts";

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

export interface FantasyConfig {
  leagueId: string;
  teamId: number;
  season: number;
  /** Optional: a public league reads fine without cookies. Never logged or returned. */
  espnS2?: string;
  swid?: string;
}

/** Reads the config from environment variables. Errors name missing variables, never values. */
export function fantasyConfigFromEnv(env: Record<string, string | undefined>): FantasyConfig {
  const leagueId = env.LEAGUE_ID?.trim() ?? "";
  const teamId = Number(env.TEAM_ID);
  const season = Number(env.SEASON);
  const bad = [
    !/^\d+$/.test(leagueId) && "LEAGUE_ID",
    !(Number.isInteger(teamId) && teamId > 0) && "TEAM_ID",
    !(Number.isInteger(season) && season > 2000) && "SEASON",
  ].filter(Boolean);
  if (bad.length) throw new Error(`Missing or invalid environment variables: ${bad.join(", ")}`);
  return { leagueId, teamId, season, espnS2: env.ESPN_S2?.trim() || undefined, swid: env.ESPN_SWID?.trim() || undefined };
}

export class EspnFantasySource implements FantasySource {
  private readonly config: FantasyConfig;
  constructor(config: FantasyConfig) {
    this.config = config;
  }

  async getMatchup(): Promise<FantasyMatchup> {
    // 1 KB call for the current week, then this week's matchups only (the unfiltered pull is ~21 MB).
    const status = await this.get("view=mStatus");
    const week = status.scoringPeriodId ?? 1;
    const matchupPeriod = status.status?.currentMatchupPeriod ?? week;
    const league = await this.get(`view=mMatchupScore&view=mBoxscore&scoringPeriodId=${week}`, {
      "x-fantasy-filter": JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [matchupPeriod] } } }),
    });
    return normalizeFantasy(league, { leagueId: this.config.leagueId, teamId: this.config.teamId, week, matchupPeriod });
  }

  private async get(query: string, headers: Record<string, string> = {}): Promise<EspnFantasyLeague> {
    const { leagueId, season, espnS2, swid } = this.config;
    if (espnS2 && swid) headers = { ...headers, Cookie: `espn_s2=${espnS2}; SWID=${swid}` };
    try {
      return await fetchJson<EspnFantasyLeague>(`${BASE}/${season}/segments/0/leagues/${leagueId}?${query}`, headers);
    } catch (error) {
      // 401/403, or a redirect to a login page, means ESPN wants valid cookies.
      if (error instanceof UpstreamError && (error.status === 401 || error.status === 403 || (error.status >= 300 && error.status < 400))) {
        throw new FantasyAuthError(
          "ESPN refused the fantasy request. If the league is private, set fresh ESPN_S2 and ESPN_SWID cookies.",
        );
      }
      throw error;
    }
  }
}
