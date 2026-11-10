import type { BigPlayRules } from "../../shared/bigPlayRules.ts";
import type { GamePlays, OddsResponse, Scoreboard } from "../../shared/types.ts";
import { fetchJson } from "../http.ts";
import type { NflDataSource, ScoreboardQuery } from "../sources.ts";
import { detectBigPlays } from "./detectBigPlays.ts";
import type { EspnCorePlayList, EspnScoreboard, EspnSummary } from "./espnTypes.ts";
import { normalizeOdds } from "./normalizeOdds.ts";
import { normalizeScoreboard } from "./normalizeScoreboard.ts";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const CORE_PAGE_SIZE = 400; // a whole game fits on one page

export class EspnNflSource implements NflDataSource {
  async getScoreboard(query: ScoreboardQuery = {}): Promise<Scoreboard> {
    return normalizeScoreboard(await this.rawScoreboard(query));
  }

  /** Same ESPN call as the scoreboard, read for its lines (DraftKings, via ESPN). */
  async getOdds(query: ScoreboardQuery = {}): Promise<OddsResponse> {
    return normalizeOdds(await this.rawScoreboard(query));
  }

  private rawScoreboard(query: ScoreboardQuery): Promise<EspnScoreboard> {
    const params = new URLSearchParams();
    if (query.week) params.set("week", String(query.week));
    if (query.seasonType) params.set("seasontype", String(query.seasonType));
    const qs = params.size ? `?${params}` : "";
    return fetchJson<EspnScoreboard>(`${SITE}/scoreboard${qs}`);
  }

  async getGamePlays(gameId: string, rules: BigPlayRules): Promise<GamePlays> {
    const [summary, core] = await Promise.allSettled([
      fetchJson<EspnSummary>(`${SITE}/summary?event=${gameId}`),
      this.getCorePlays(gameId),
    ]);
    if (summary.status === "rejected") throw summary.reason;
    const corePlays = core.status === "fulfilled" ? core.value : null;
    return {
      gameId,
      plays: detectBigPlays(summary.value, corePlays, rules),
      playersFromCoreApi: corePlays !== null,
    };
  }

  private async getCorePlays(gameId: string): Promise<EspnCorePlayList> {
    const url = (page: number) =>
      `${CORE}/events/${gameId}/competitions/${gameId}/plays?limit=${CORE_PAGE_SIZE}&page=${page}`;
    const first = await fetchJson<EspnCorePlayList>(url(1));
    const items = [...first.items];
    for (let page = 2; page <= (first.pageCount ?? 1); page++) {
      items.push(...(await fetchJson<EspnCorePlayList>(url(page))).items);
    }
    return { items };
  }
}
