import type { BigPlayRules } from "../../shared/bigPlayRules.ts";
import type { GamePlays, Scoreboard } from "../../shared/types.ts";
import { fetchJson } from "../http.ts";
import type { NflDataSource, ScoreboardQuery } from "../sources.ts";
import { detectBigPlays } from "./detectBigPlays.ts";
import type { EspnCorePlayList, EspnScoreboard, EspnSummary } from "./espnTypes.ts";
import { normalizeScoreboard } from "./normalizeScoreboard.ts";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const CORE_PAGE_SIZE = 400; // a whole game fits on one page

export class EspnNflSource implements NflDataSource {
  async getScoreboard(query: ScoreboardQuery = {}): Promise<Scoreboard> {
    const params = new URLSearchParams();
    if (query.week) params.set("week", String(query.week));
    if (query.seasonType) params.set("seasontype", String(query.seasonType));
    const qs = params.size ? `?${params}` : "";
    return normalizeScoreboard(await fetchJson<EspnScoreboard>(`${SITE}/scoreboard${qs}`));
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
