import type { BigPlayRules } from "../shared/bigPlayRules.ts";
import type { ApiError, ApiErrorCode, FantasyMatchup, OddsResponse, PlaysResponse, Scoreboard } from "../shared/types.ts";
import { getAccessKey, reportAccessDenied } from "./accessKey.ts";
import { teamHeaders, teamQuery, type SavedTeam, type TeamChoice } from "./teamUrl.ts";

/** Where the page gets its data: the Netlify functions, or a recording in replay mode. */
export interface ClientSource {
  scoreboard(week?: number): Promise<Scoreboard>;
  plays(gameIds: string[], rules: BigPlayRules): Promise<PlaysResponse>;
  /** The selected tab's team, with its cookies if private. */
  fantasy(team?: TeamChoice | SavedTeam | null): Promise<FantasyMatchup>;
  /** True only for a replay started with &team=: everywhere else there is no team until one is added. */
  servesDefaultTeam?: boolean;
  /** Called only from the "Update odds" button. */
  odds(week?: number): Promise<OddsResponse>;
  /** The current time as the data sees it (a replay runs on its own clock). */
  now(): number;
  /** Replay polls faster than real time; live uses the settings. */
  pollOverrideMs?: number;
  /** Remember fetched odds across visits (live only, so a replay can't overwrite them). Default true. */
  persistOdds?: boolean;
}

export class ApiFetchError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "network";
  constructor(status: number, code: ApiErrorCode | "network", message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function rulesQuery(rules: BigPlayRules): string {
  return new URLSearchParams({
    rush: String(rules.longRushYards),
    catch: String(rules.longCatchYards),
    fumbles: rules.fumbles,
    fgMade: rules.fieldGoals.made ? "1" : "0",
    fgMissed: rules.fieldGoals.missed ? "1" : "0",
  }).toString();
}

export async function getApi<T>(path: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders };
  const key = getAccessKey();
  if (key) headers["X-Access-Key"] = key;
  let res: Response;
  try {
    res = await fetch(path, { headers });
  } catch {
    throw new ApiFetchError(0, "network", "Can't reach the server");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiFetchError(res.status, "upstream", `Unexpected response (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const error = (body as ApiError)?.error;
    if (res.status === 401 && error?.code === "unauthorized") reportAccessDenied();
    throw new ApiFetchError(res.status, error?.code ?? "upstream", error?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const liveSource: ClientSource = {
  scoreboard: (week) => getApi(week ? `/api/scoreboard?week=${week}&seasontype=2` : "/api/scoreboard"),
  plays: (gameIds, rules) => getApi(`/api/plays?events=${gameIds.join(",")}&${rulesQuery(rules)}`),
  fantasy: (team) => getApi(`/api/fantasy${teamQuery(team)}`, teamHeaders(team)),
  odds: (week) => getApi(week ? `/api/odds?week=${week}&seasontype=2` : "/api/odds"),
  now: () => Date.now(),
};
