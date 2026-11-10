// Request handling for the three endpoints, kept free of Netlify specifics so tests can call it directly.
import { DEFAULT_RULES, type BigPlayRules } from "../../shared/bigPlayRules.ts";
import type { ApiError, ApiErrorCode, PlaysResponse } from "../../shared/types.ts";
import { UpstreamError } from "../http.ts";
import { FantasyAuthError, type FantasySource, type NflDataSource } from "../sources.ts";

const MAX_EVENTS = 16;
const LIVE_CACHE_SECONDS = 10;
const IDLE_CACHE_SECONDS = 60;

export async function handleScoreboard(req: Request, nfl: NflDataSource): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  try {
    const week = intParam(url, "week", 1, 25);
    const seasonType = intParam(url, "seasontype", 1, 4);
    const board = await nfl.getScoreboard({ week, seasonType });
    const live = board.games.some((g) => g.state === "in");
    return json(board, 200, cdnCache(live ? LIVE_CACHE_SECONDS : IDLE_CACHE_SECONDS));
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/odds: the page calls this only when the "Update odds" button is pressed, so it's never cached. */
export async function handleOdds(req: Request, nfl: NflDataSource): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  try {
    const week = intParam(url, "week", 1, 25);
    const seasonType = intParam(url, "seasontype", 1, 4);
    return json(await nfl.getOdds({ week, seasonType }), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/plays: current big plays for each game asked for, or for every in-progress game when no
 * `events` are given. The browser diffs the result against what it has shown, so new, corrected and
 * overturned plays all arrive the same way. Rules come from the query (the settings panel's thresholds).
 */
export async function handlePlays(req: Request, nfl: NflDataSource): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  try {
    const rules = rulesFromQuery(url);
    const requested = eventsParam(url);
    const gameIds = requested ?? (await nfl.getScoreboard()).games.filter((g) => g.state === "in").map((g) => g.id);

    const results = await Promise.allSettled(gameIds.map((id) => nfl.getGamePlays(id, rules)));
    const body: PlaysResponse = { games: [], errors: [] };
    results.forEach((result, i) => {
      if (result.status === "fulfilled") body.games.push(result.value);
      else body.errors.push({ gameId: gameIds[i], message: safeMessage(result.reason) });
    });
    if (body.games.length === 0 && body.errors.length > 0) return apiError("upstream", body.errors[0].message, 502);
    return json(body, 200, cdnCache(LIVE_CACHE_SECONDS));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `connect` builds the source from the environment, so a missing variable becomes a clear "config" error. */
export async function handleFantasy(req: Request, connect: () => FantasySource): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  let source: FantasySource;
  try {
    source = connect();
  } catch (error) {
    return apiError("config", safeMessage(error), 500);
  }
  try {
    // Never on the CDN: fantasy responses stay between this function and the browser.
    return json(await source.getMatchup(), 200, { "Cache-Control": `private, max-age=${LIVE_CACHE_SECONDS}` });
  } catch (error) {
    return errorResponse(error);
  }
}

// ---- query parsing ----

class BadRequest extends Error {}

function intParam(url: URL, name: string, min: number, max: number): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}

function flagParam(url: URL, name: string, fallback: boolean): boolean {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new BadRequest(`${name} must be 1 or 0`);
}

export function rulesFromQuery(url: URL): BigPlayRules {
  const fumbles = url.searchParams.get("fumbles") || DEFAULT_RULES.fumbles;
  if (fumbles !== "all" && fumbles !== "lost" && fumbles !== "none") throw new BadRequest("fumbles must be all, lost or none");
  return {
    longRushYards: intParam(url, "rush", 1, 99) ?? DEFAULT_RULES.longRushYards,
    longCatchYards: intParam(url, "catch", 1, 99) ?? DEFAULT_RULES.longCatchYards,
    fumbles,
    fieldGoals: {
      made: flagParam(url, "fgMade", DEFAULT_RULES.fieldGoals.made),
      missed: flagParam(url, "fgMissed", DEFAULT_RULES.fieldGoals.missed),
    },
  };
}

function eventsParam(url: URL): string[] | null {
  const raw = url.searchParams.get("events");
  if (raw === null || raw.trim() === "") return null;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length > MAX_EVENTS) throw new BadRequest(`events accepts at most ${MAX_EVENTS} game IDs`);
  if (!ids.every((id) => /^\d{1,12}$/.test(id))) throw new BadRequest("events must be numeric ESPN game IDs, comma-separated");
  return ids;
}

// ---- responses ----

/**
 * Public NFL data: browsers revalidate every time, Netlify's CDN serves one copy for `seconds`.
 * The CDN keys its copy on the access key, so a request without the key never gets a cached answer.
 */
function cdnCache(seconds: number): Record<string, string> {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
    "Netlify-Vary": "header=X-Access-Key",
  };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function apiError(code: ApiErrorCode, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return json(body, status, { "Cache-Control": "no-store" });
}

const methodNotAllowed = () => apiError("method_not_allowed", "Only GET is supported", 405);

function errorResponse(error: unknown): Response {
  if (error instanceof BadRequest) return apiError("bad_request", error.message, 400);
  if (error instanceof FantasyAuthError) return apiError("espn_auth", error.message, 502);
  if (error instanceof UpstreamError) return apiError("upstream", error.message, 502);
  console.error("Unexpected error:", safeMessage(error));
  return apiError("upstream", "Unexpected error while reading ESPN data", 500);
}

/** Our own errors carry safe messages (status and path only); anything else gets a generic one. */
function safeMessage(error: unknown): string {
  if (error instanceof UpstreamError || error instanceof FantasyAuthError || error instanceof BadRequest) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing or invalid environment variables")) return error.message;
  return "Unexpected error while reading ESPN data";
}
