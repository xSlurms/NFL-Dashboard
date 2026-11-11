import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleFantasy, handleOdds, handlePlays, handleScoreboard } from "../src/server/api/handlers.ts";
import { detectBigPlays } from "../src/server/espn/detectBigPlays.ts";
import { EspnFantasySource, clearWeekCache, fantasyConfig } from "../src/server/espn/espnFantasySource.ts";
import { EspnNflSource } from "../src/server/espn/espnNflSource.ts";
import { normalizeScoreboard } from "../src/server/espn/normalizeScoreboard.ts";
import { UpstreamError } from "../src/server/http.ts";
import { normalizeOdds } from "../src/server/espn/normalizeOdds.ts";
import { FantasyAuthError, type FantasySource, type NflDataSource, type ScoreboardQuery } from "../src/server/sources.ts";
import { DEFAULT_RULES, type BigPlayRules } from "../src/shared/bigPlayRules.ts";
import type { ApiError, FantasyMatchup, GamePlays, OddsResponse, PlaysResponse, Scoreboard } from "../src/shared/types.ts";
import { NFL_DIR, readJson } from "./fixtures.ts";

const finishedBoard = normalizeScoreboard(readJson(`${NFL_DIR}/scoreboard.json`));
const summaryOf = (id: string) => readJson(`${NFL_DIR}/summary-${id}.json`);
const coreOf = (id: string) => readJson(`${NFL_DIR}/core-plays-${id}.json`);

/** Week 9 with two games flipped to in progress. */
function boardWithLive(...ids: string[]): Scoreboard {
  return { ...finishedBoard, games: finishedBoard.games.map((g) => (ids.includes(g.id) ? { ...g, state: "in" as const } : g)) };
}

class FakeNfl implements NflDataSource {
  calls: { gameId: string; rules: BigPlayRules }[] = [];
  board: Scoreboard;
  failing = new Set<string>();
  constructor(board: Scoreboard) {
    this.board = board;
  }
  oddsQueries: ScoreboardQuery[] = [];
  async getScoreboard() {
    return this.board;
  }
  async getOdds(query: ScoreboardQuery = {}): Promise<OddsResponse> {
    this.oddsQueries.push(query);
    return normalizeOdds(readJson(`${NFL_DIR}/scoreboard-week10-pre.json`));
  }
  async getGamePlays(gameId: string, rules: BigPlayRules): Promise<GamePlays> {
    this.calls.push({ gameId, rules });
    if (this.failing.has(gameId)) throw new UpstreamError(503, `/summary`);
    return { gameId, plays: detectBigPlays(summaryOf(gameId), coreOf(gameId), rules), playersFromCoreApi: true };
  }
}

const get = (path: string, method = "GET") => new Request(`http://localhost${path}`, { method });
const body = async <T>(res: Response) => (await res.json()) as T;

describe("GET /api/scoreboard", () => {
  it("returns the scoreboard with a 60s CDN cache when nothing is live", async () => {
    const res = await handleScoreboard(get("/api/scoreboard"), new FakeNfl(finishedBoard));
    expect(res.status).toBe(200);
    expect((await body<Scoreboard>(res)).games).toHaveLength(15);
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toContain("s-maxage=60");
    expect(res.headers.get("Cache-Control")).toContain("max-age=0");
    expect(res.headers.get("Netlify-Vary")).toBe("header=X-Access-Key"); // no cached answer without the key
  });

  it("drops the CDN cache to 10s while a game is live", async () => {
    const res = await handleScoreboard(get("/api/scoreboard"), new FakeNfl(boardWithLive("401873051")));
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toContain("s-maxage=10");
  });

  it("rejects a bad week and non-GET methods", async () => {
    const nfl = new FakeNfl(finishedBoard);
    const bad = await handleScoreboard(get("/api/scoreboard?week=abc"), nfl);
    expect(bad.status).toBe(400);
    expect((await body<ApiError>(bad)).error.code).toBe("bad_request");
    expect((await handleScoreboard(get("/api/scoreboard", "POST"), nfl)).status).toBe(405);
  });
});

describe("GET /api/odds", () => {
  it("returns the lines for the week asked for, never cached", async () => {
    const nfl = new FakeNfl(finishedBoard);
    const res = await handleOdds(get("/api/odds?week=10&seasontype=2"), nfl);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toBeNull();
    expect(nfl.oddsQueries).toEqual([{ week: 10, seasonType: 2 }]);
    expect((await body<OddsResponse>(res)).games).toHaveLength(14);
  });

  it("rejects a bad week", async () => {
    expect((await handleOdds(get("/api/odds?week=99"), new FakeNfl(finishedBoard))).status).toBe(400);
  });
});

describe("GET /api/plays", () => {
  it("covers only in-progress games by default, with the default rules", async () => {
    const nfl = new FakeNfl(boardWithLive("401873051", "401873037"));
    const res = await handlePlays(get("/api/plays"), nfl);
    const data = await body<PlaysResponse>(res);
    expect(res.status).toBe(200);
    expect(data.games.map((g) => g.gameId).sort()).toEqual(["401873037", "401873051"]);
    expect(data.errors).toEqual([]);
    expect(nfl.calls.every((c) => JSON.stringify(c.rules) === JSON.stringify(DEFAULT_RULES))).toBe(true);
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toContain("s-maxage=10");
  });

  it("returns an empty list when nothing is live", async () => {
    const data = await body<PlaysResponse>(await handlePlays(get("/api/plays"), new FakeNfl(finishedBoard)));
    expect(data).toEqual({ games: [], errors: [] });
  });

  it("uses the games named in ?events, deduped", async () => {
    const nfl = new FakeNfl(finishedBoard);
    const data = await body<PlaysResponse>(await handlePlays(get("/api/plays?events=401873051,401873051,401873042"), nfl));
    expect(data.games.map((g) => g.gameId)).toEqual(["401873051", "401873042"]);
  });

  it("applies rules from the query", async () => {
    const nfl = new FakeNfl(finishedBoard);
    const res = await handlePlays(get("/api/plays?events=401873037&rush=30&catch=60&fumbles=lost&fgMade=0&fgMissed=1"), nfl);
    expect(nfl.calls[0].rules).toEqual({ longRushYards: 30, longCatchYards: 60, fumbles: "lost", fieldGoals: { made: false, missed: true } });
    const plays = (await body<PlaysResponse>(res)).games[0].plays;
    expect(plays.some((p) => p.tags.includes("FG"))).toBe(false);
    expect(plays.some((p) => p.tags.includes("FUMBLE"))).toBe(false);
    for (const p of plays) if (p.tags.includes("LONG_CATCH")) expect(p.yards).toBeGreaterThanOrEqual(60);
  });

  it.each([
    ["events=abc", "numeric"],
    ["events=" + Array.from({ length: 17 }, (_, i) => 401873000 + i).join(","), "at most 16"],
    ["rush=0", "rush"],
    ["catch=40.5", "catch"],
    ["fumbles=some", "fumbles"],
    ["fgMade=yes", "fgMade"],
  ])("rejects ?%s", async (query, message) => {
    const res = await handlePlays(get(`/api/plays?${query}`), new FakeNfl(finishedBoard));
    expect(res.status).toBe(400);
    expect((await body<ApiError>(res)).error.message).toContain(message);
  });

  it("reports a failing game without losing the others", async () => {
    const nfl = new FakeNfl(finishedBoard);
    nfl.failing.add("401873042");
    const res = await handlePlays(get("/api/plays?events=401873051,401873042"), nfl);
    const data = await body<PlaysResponse>(res);
    expect(res.status).toBe(200);
    expect(data.games.map((g) => g.gameId)).toEqual(["401873051"]);
    expect(data.errors).toEqual([{ gameId: "401873042", message: "ESPN returned HTTP 503 for /summary" }]);
  });

  it("returns 502 when every game fails", async () => {
    const nfl = new FakeNfl(finishedBoard);
    nfl.failing.add("401873042");
    const res = await handlePlays(get("/api/plays?events=401873042"), nfl);
    expect(res.status).toBe(502);
    expect((await body<ApiError>(res)).error.code).toBe("upstream");
  });
});

describe("GET /api/fantasy", () => {
  const matchup = { leagueId: "1", season: 2026, week: 10 } as FantasyMatchup;
  const source = (getMatchup: () => Promise<FantasyMatchup>): FantasySource => ({ getMatchup });

  it("returns the matchup, cached privately and never on the CDN", async () => {
    const res = await handleFantasy(get("/api/fantasy"), () => source(async () => matchup));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(matchup);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=10");
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toBeNull();
    expect(res.headers.get("Vary")).toContain("X-Espn-S2"); // a browser never reuses one league's answer for other cookies
  });

  it("asks the page for a team when none is given: there is no default", async () => {
    const res = await handleFantasy(get("/api/fantasy"), (query, headers) => new EspnFantasySource(fantasyConfig(query, headers)));
    expect(res.status).toBe(404);
    expect((await body<ApiError>(res)).error.code).toBe("no_team");
  });

  it("passes the team from the query, and rejects a bad one", async () => {
    let seen: URLSearchParams | null = null;
    const res = await handleFantasy(get("/api/fantasy?leagueId=55&teamId=3"), (query) => {
      seen = query;
      return source(async () => matchup);
    });
    expect(res.status).toBe(200);
    expect(seen!.get("leagueId")).toBe("55");
    const bad = await handleFantasy(get("/api/fantasy?leagueId=55"), (query, headers) => new EspnFantasySource(fantasyConfig(query, headers)));
    expect(bad.status).toBe(400);
    expect((await body<ApiError>(bad)).error.code).toBe("bad_request");
  });

  it("tells the page to refresh cookies when ESPN refuses", async () => {
    const res = await handleFantasy(get("/api/fantasy"), () => source(async () => { throw new FantasyAuthError("refresh cookies"); }));
    expect(res.status).toBe(502);
    expect((await body<ApiError>(res)).error).toEqual({ code: "espn_auth", message: "refresh cookies" });
  });

  it("hides unexpected error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleFantasy(get("/api/fantasy"), () => source(async () => { throw new Error("secret detail"); }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await body(res))).not.toContain("secret detail");
  });
});

// ---- the ESPN adapters, with fetch stubbed ----

type Route = (url: URL, init: RequestInit) => Response | undefined;
function stubFetch(route: Route) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    return route(url, init) ?? new Response("not found", { status: 404 });
  });
  return calls;
}
const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => vi.unstubAllGlobals());

describe("EspnNflSource", () => {
  const gameId = "401873051";

  it("joins the summary and the core play list, like the detector does offline", async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith("/summary") && url.searchParams.get("event") === gameId) return jsonResponse(summaryOf(gameId));
      if (url.pathname.endsWith(`/competitions/${gameId}/plays`)) return jsonResponse({ ...coreOf(gameId), pageCount: 1 });
    });
    const result = await new EspnNflSource().getGamePlays(gameId, DEFAULT_RULES);
    expect(result.playersFromCoreApi).toBe(true);
    expect(result.plays).toEqual(detectBigPlays(summaryOf(gameId), coreOf(gameId), DEFAULT_RULES));
  });

  it("still finds the plays when the core API is down", async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith("/summary")) return jsonResponse(summaryOf(gameId));
      return new Response("busy", { status: 503 });
    });
    const result = await new EspnNflSource().getGamePlays(gameId, DEFAULT_RULES);
    expect(result.playersFromCoreApi).toBe(false);
    expect(result.plays.map((p) => p.id)).toEqual(detectBigPlays(summaryOf(gameId), coreOf(gameId), DEFAULT_RULES).map((p) => p.id));
  });

  it("fetches every page of a long core play list", async () => {
    const items = coreOf(gameId).items;
    const half = Math.ceil(items.length / 2);
    const calls = stubFetch((url) => {
      if (url.pathname.endsWith("/summary")) return jsonResponse(summaryOf(gameId));
      const page = url.searchParams.get("page");
      return jsonResponse({ items: page === "1" ? items.slice(0, half) : items.slice(half), pageCount: 2 });
    });
    const result = await new EspnNflSource().getGamePlays(gameId, DEFAULT_RULES);
    expect(calls.filter((c) => c.url.pathname.endsWith("/plays")).map((c) => c.url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(result.plays).toEqual(detectBigPlays(summaryOf(gameId), coreOf(gameId), DEFAULT_RULES));
  });

  it("passes the week to the scoreboard", async () => {
    const calls = stubFetch(() => jsonResponse(readJson(`${NFL_DIR}/scoreboard-week10-pre.json`)));
    const board = await new EspnNflSource().getScoreboard({ week: 10, seasonType: 2 });
    expect(calls[0].url.search).toBe("?week=10&seasontype=2");
    expect(board.week).toBe(10);
  });
});

describe("EspnFantasySource", () => {
  const status = { seasonId: 2026, scoringPeriodId: 10, status: { currentMatchupPeriod: 10 } };
  const league = {
    seasonId: 2026,
    teams: [{ id: 4, name: "Mine" }, { id: 7, name: "Theirs" }],
    schedule: [{ matchupPeriodId: 10, home: { teamId: 4, totalPointsLive: 12 }, away: { teamId: 7, totalPointsLive: 9 } }],
  };
  const route: Route = (url) => (url.searchParams.getAll("view").includes("mStatus") ? jsonResponse(status) : jsonResponse(league));
  const config = { leagueId: "338094", teamId: 4, season: 2026 };
  beforeEach(() => clearWeekCache()); // each test sees the full two-call flow

  it("asks for the current week, then only that week's matchups", async () => {
    const calls = stubFetch(route);
    const matchup = await new EspnFantasySource(config).getMatchup();
    expect(calls).toHaveLength(2);
    expect(calls[0].url.pathname).toBe("/apis/v3/games/ffl/seasons/2026/segments/0/leagues/338094");
    expect(calls[1].url.searchParams.getAll("view")).toEqual(["mMatchupScore", "mBoxscore"]);
    expect(calls[1].url.searchParams.get("scoringPeriodId")).toBe("10");
    expect(JSON.parse(calls[1].headers["x-fantasy-filter"])).toEqual({ schedule: { filterMatchupPeriodIds: { value: [10] } } });
    expect(matchup).toMatchObject({ week: 10, me: { name: "Mine", totalPoints: 12 }, opponent: { name: "Theirs", totalPoints: 9 } });
  });

  it("sends cookies only when both are set", async () => {
    let calls = stubFetch(route);
    await new EspnFantasySource(config).getMatchup();
    expect(calls.every((c) => !("Cookie" in c.headers))).toBe(true);

    calls = stubFetch(route);
    await new EspnFantasySource({ ...config, espnS2: "S2VALUE", swid: "{SWID-VALUE}" }).getMatchup();
    expect(calls.every((c) => c.headers.Cookie === "espn_s2=S2VALUE; SWID={SWID-VALUE}")).toBe(true);
  });

  it.each([401, 403, 302])("turns HTTP %i into a cookie error that names no cookie", async (code) => {
    stubFetch(() => new Response("", { status: code }));
    const promise = new EspnFantasySource({ ...config, espnS2: "S2VALUE", swid: "{SWID-VALUE}" }).getMatchup();
    await expect(promise).rejects.toBeInstanceOf(FantasyAuthError);
    await expect(promise).rejects.not.toThrow(/S2VALUE|SWID-VALUE/);
  });

  it("passes other ESPN failures through as upstream errors", async () => {
    stubFetch(() => new Response("", { status: 500 }));
    await expect(new EspnFantasySource(config).getMatchup()).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("fantasyConfig", () => {
  const q = (s: string) => new URLSearchParams(s);
  const h = (headers: Record<string, string> = {}) => new Headers(headers);
  const nov2026 = new Date("2026-11-10T12:00:00Z");

  it("takes the team from the request, picking the current season", () => {
    expect(fantasyConfig(q("leagueId=12345&teamId=3"), h(), nov2026)).toEqual({ leagueId: "12345", teamId: 3, season: 2026 });
    expect(fantasyConfig(q("leagueId=12345&teamId=3"), h(), new Date("2027-01-20T12:00:00Z")).season).toBe(2026); // playoffs run into January
    expect(fantasyConfig(q("leagueId=338094&teamId=7&season=2025")).season).toBe(2025);
  });

  it("has no default team and ignores any server environment", () => {
    const saved = { ...process.env };
    process.env.LEAGUE_ID = "338094";
    process.env.TEAM_ID = "4";
    process.env.ESPN_S2 = "SERVER-S2";
    try {
      expect(() => fantasyConfig()).toThrow(expect.objectContaining({ code: "no_team" }));
      expect(fantasyConfig(q("leagueId=338094&teamId=4"))).not.toHaveProperty("espnS2");
    } finally {
      process.env = saved;
    }
  });

  it.each([
    ["leagueId=338094", "together"],
    ["teamId=4", "together"],
    ["leagueId=abc&teamId=4", "league number"],
    ["leagueId=1&teamId=0", "teamId"],
    ["leagueId=1&teamId=4&season=26", "season"],
  ])("rejects ?%s", (query, message) => {
    expect(() => fantasyConfig(q(query))).toThrow(expect.objectContaining({ code: "bad_request", message: expect.stringContaining(message) }));
  });

  describe("a private league's cookies from the page", () => {
    const s2 = "AEBx%2Fabc123%3D%3Dmore%2Bstuff0123456789";
    const swid = "1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D";

    it("uses them for the league in the same request, adding SWID's braces", () => {
      const config = fantasyConfig(q("leagueId=777&teamId=2"), h({ "X-Espn-S2": s2, "X-Espn-Swid": swid }), nov2026);
      expect(config).toEqual({ leagueId: "777", teamId: 2, season: 2026, espnS2: s2, swid: `{${swid}}` });
    });

    it.each([
      [{ "X-Espn-S2": s2 }, "together"],
      [{ "X-Espn-Swid": swid }, "together"],
      [{ "X-Espn-S2": `${s2}; SWID=x`, "X-Espn-Swid": swid }, "espn_s2"],
      [{ "X-Espn-S2": s2, "X-Espn-Swid": "nope" }, "SWID"],
    ])("rejects bad cookie headers without echoing them", (headers, message) => {
      let error: Error | null = null;
      try {
        fantasyConfig(q("leagueId=777&teamId=2"), h(headers), nov2026);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toMatchObject({ code: "bad_request", message: expect.stringContaining(message) });
      expect(error!.message).not.toContain(s2);
      expect(error!.message).not.toContain(swid);
    });
  });
});

describe("EspnFantasySource week cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearWeekCache();
  });

  it("asks ESPN for the current week once, then reuses it for that league", async () => {
    clearWeekCache();
    const calls = stubFetch((url) =>
      url.searchParams.getAll("view").includes("mStatus")
        ? jsonResponse({ scoringPeriodId: 10, status: { currentMatchupPeriod: 10 } })
        : jsonResponse({ seasonId: 2026, teams: [], schedule: [] }),
    );
    const config = { leagueId: "338094", teamId: 4, season: 2026 };
    await new EspnFantasySource(config).getMatchup();
    await new EspnFantasySource(config).getMatchup();
    await new EspnFantasySource({ ...config, teamId: 7 }).getMatchup(); // same league, another team
    await new EspnFantasySource({ ...config, leagueId: "999" }).getMatchup(); // another league
    const statusCalls = calls.filter((c) => c.url.searchParams.getAll("view").includes("mStatus"));
    expect(statusCalls.map((c) => c.url.pathname.split("/").at(-1))).toEqual(["338094", "999"]);
    expect(calls).toHaveLength(6);
  });
});

describe("EspnFantasySource with a private league's cookies", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends them to ESPN as cookies, and says they may have expired when ESPN refuses", async () => {
    const calls = stubFetch(() => new Response("", { status: 401 }));
    const config = { leagueId: "777", teamId: 2, season: 2026, espnS2: "S2VALUE", swid: "{SWID}" };
    const promise = new EspnFantasySource(config).getMatchup();
    await expect(promise).rejects.toThrow(/expired/);
    expect(calls[0].headers.Cookie).toBe("espn_s2=S2VALUE; SWID={SWID}");
    stubFetch(() => new Response("", { status: 401 }));
    await expect(new EspnFantasySource({ leagueId: "777", teamId: 2, season: 2026 }).getMatchup()).rejects.toThrow(/private/);
  });
});
