import { ESPN_S2_HEADER, ESPN_SWID_HEADER, isEspnS2, isLeagueId, isSeason, isTeamId, normalizeSwid } from "../../shared/espnIds.ts";
import type { FantasyMatchup } from "../../shared/types.ts";
import { UpstreamError, fetchJson } from "../http.ts";
import { FantasyAuthError, type FantasySource } from "../sources.ts";
import type { EspnFantasyLeague } from "./espnTypes.ts";
import { normalizeFantasy } from "./normalizeFantasy.ts";

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

// League -> current week. Week numbers aren't sensitive, so one entry serves every viewer of a league.
const WEEK_CACHE_MS = 10 * 60_000;
const weekCache = new Map<string, { week: number; matchupPeriod: number; expires: number }>();
export const clearWeekCache = () => weekCache.clear();

export interface FantasyConfig {
  leagueId: string;
  teamId: number;
  season: number;
  /** Optional: a public league reads fine without cookies. Never logged or returned. */
  espnS2?: string;
  swid?: string;
}

/** A team that can't be used: "bad_request" for a malformed choice from the page, "no_team" when none was given. */
export class FantasyConfigError extends Error {
  readonly code: "bad_request" | "no_team";
  constructor(code: FantasyConfigError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** The fantasy season a date falls in: a season starts in September and its leagues are renewed by early summer. */
export function currentSeason(now: Date): number {
  return now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/**
 * Everything comes from the request: the team the page added (query) and, for a private league, that
 * league's cookies (X-Espn-S2 / X-Espn-Swid headers), used only for the league in the same request.
 * The server has no team or cookies of its own. Errors name fields, never their values.
 */
export function fantasyConfig(query = new URLSearchParams(), headers: Headers = new Headers(), now = new Date()): FantasyConfig {
  const qLeague = query.get("leagueId")?.trim() || null;
  const qTeam = query.get("teamId")?.trim() || null;
  const qSeason = query.get("season")?.trim() || null;

  if (!qLeague && !qTeam) throw new FantasyConfigError("no_team", "No team chosen yet. Add a team to see a matchup.");
  if (!qLeague || !qTeam) throw new FantasyConfigError("bad_request", "leagueId and teamId must be given together");
  const teamId = Number(qTeam);
  if (!isLeagueId(qLeague)) throw new FantasyConfigError("bad_request", "leagueId must be an ESPN league number");
  if (!isTeamId(teamId)) throw new FantasyConfigError("bad_request", "teamId must be a whole number from 1 to 999");
  const leagueId = qLeague;

  const season = qSeason ? Number(qSeason) : currentSeason(now);
  if (!isSeason(season)) throw new FantasyConfigError("bad_request", "season must be a year like 2026");

  const givenS2 = headers.get(ESPN_S2_HEADER)?.trim() || null;
  const givenSwid = headers.get(ESPN_SWID_HEADER)?.trim() || null;
  if (!givenS2 && !givenSwid) return { leagueId, teamId, season };
  if (!givenS2 || !givenSwid) throw new FantasyConfigError("bad_request", "espn_s2 and SWID must be given together");
  if (!isEspnS2(givenS2)) throw new FantasyConfigError("bad_request", "That espn_s2 value doesn't look right");
  const swid = normalizeSwid(givenSwid);
  if (!swid) throw new FantasyConfigError("bad_request", "That SWID doesn't look right; it looks like {1A2B3C4D-…}");
  return { leagueId, teamId, season, espnS2: givenS2, swid };
}

export class EspnFantasySource implements FantasySource {
  private readonly config: FantasyConfig;
  constructor(config: FantasyConfig) {
    this.config = config;
  }

  async getMatchup(): Promise<FantasyMatchup> {
    // The current week (a 1 KB call, remembered for a while), then this week's matchups only (the unfiltered pull is ~21 MB).
    const { week, matchupPeriod } = await this.currentWeek();
    const league = await this.get(`view=mMatchupScore&view=mBoxscore&scoringPeriodId=${week}`, {
      "x-fantasy-filter": JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [matchupPeriod] } } }),
    });
    return normalizeFantasy(league, { leagueId: this.config.leagueId, teamId: this.config.teamId, week, matchupPeriod });
  }

  /** Kept per league while the function instance stays warm; the week only changes once a week. */
  private async currentWeek(): Promise<{ week: number; matchupPeriod: number }> {
    const key = `${this.config.season}:${this.config.leagueId}`;
    const cached = weekCache.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    const status = await this.get("view=mStatus");
    const week = status.scoringPeriodId ?? 1;
    const entry = { week, matchupPeriod: status.status?.currentMatchupPeriod ?? week, expires: Date.now() + WEEK_CACHE_MS };
    weekCache.set(key, entry);
    return entry;
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
          espnS2
            ? "ESPN refused the cookies for this league. They may have expired (they change when you sign out of ESPN): copy fresh espn_s2 and SWID values."
            : "ESPN refused the request: this league is private. Edit the team, turn on Private league, and add your espn_s2 and SWID cookies.",
        );
      }
      throw error;
    }
  }
}
