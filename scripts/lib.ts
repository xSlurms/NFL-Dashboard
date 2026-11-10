import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseEnv } from "node:util";
import { gzipSync } from "node:zlib";

export const NFL_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const FANTASY_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";
const FANTASY_VIEWS = ["mTeam", "mRoster", "mMatchup", "mMatchupScore", "mBoxscore", "mSettings"];
const LIVE_FANTASY_VIEWS = ["mMatchupScore", "mBoxscore"];

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read fresh on every call so cookies added to .env reach a recorder that is already running. */
export function readEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(".env", "utf8"));
  } catch {
    return {};
  }
}

export function save(path: string, data: unknown, gzip = false) {
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(data, null, 2);
  writeFileSync(path, gzip ? gzipSync(text) : text);
}

/** Errors carry only the status and path, so cookies can never end up in a log. */
export async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const { pathname } = new URL(url);
  const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} from ${pathname}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${pathname}`);
  }
}

async function fantasyRequest(week: number, viewNames: string[], headers: Record<string, string> = {}): Promise<any> {
  const { ESPN_S2, ESPN_SWID, LEAGUE_ID, SEASON } = readEnv();
  if (!ESPN_S2 || !ESPN_SWID) throw new Error("ESPN cookies are not set in .env");
  if (!LEAGUE_ID || !SEASON) throw new Error("LEAGUE_ID or SEASON is not set in .env");
  const views = viewNames.map((view) => `view=${view}`).join("&");
  const url = `${FANTASY_BASE}/${SEASON}/segments/0/leagues/${LEAGUE_ID}?${views}&scoringPeriodId=${week}`;
  return getJson(url, { ...headers, Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}` });
}

/** The full league payload, about 21 MB. For one-off discovery only. */
export const getFantasy = (week: number) => fantasyRequest(week, FANTASY_VIEWS);

/** Only this week's matchups, for repeated polling during a game. */
export const getLiveFantasy = (week: number) =>
  fantasyRequest(week, LIVE_FANTASY_VIEWS, {
    "x-fantasy-filter": JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [week] } } }),
  });
