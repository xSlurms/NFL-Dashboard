import type { BigPlayRules } from "../shared/bigPlayRules.ts";
import type { ApiError, ApiErrorCode, FantasyMatchup, PlaysResponse, Scoreboard } from "../shared/types.ts";
import { getAccessKey, reportAccessDenied } from "./accessKey.ts";

/** Where the page gets its data: the Netlify functions, or a recording in replay mode. */
export interface ClientSource {
  scoreboard(week?: number): Promise<Scoreboard>;
  plays(gameIds: string[], rules: BigPlayRules): Promise<PlaysResponse>;
  fantasy(): Promise<FantasyMatchup>;
  /** The current time as the data sees it (a replay runs on its own clock). */
  now(): number;
  /** Replay polls faster than real time; live uses the settings. */
  pollOverrideMs?: number;
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

export async function getApi<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
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
  fantasy: () => getApi("/api/fantasy"),
  now: () => Date.now(),
};
