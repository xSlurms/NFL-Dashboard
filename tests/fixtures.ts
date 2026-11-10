import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export const NFL_DIR = "fixtures/nfl";
/** Monday night BUF @ MIN, recorded live. Git-ignored, so tests that need it skip on a fresh clone. */
export const LIVE_DIR = "fixtures/live/401873051";
export const LIVE_GAME_ID = "401873051";
export const FULL_LEAGUE = "fixtures/fantasy/league-week9.json";

export const hasLive = existsSync(LIVE_DIR);
export const hasFullLeague = existsSync(FULL_LEAGUE);

export const readJson = <T = any>(path: string): T => JSON.parse(readFileSync(path, "utf8"));

/** Live snapshots of one kind (summary, scoreboard, fantasy), oldest first. */
export function liveFiles(kind: "summary" | "scoreboard" | "fantasy"): string[] {
  if (!hasLive) return [];
  return readdirSync(LIVE_DIR).filter((f) => f.startsWith(`${kind}-`)).sort().map((f) => `${LIVE_DIR}/${f}`);
}

export const readGz = <T = any>(path: string): T => JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
