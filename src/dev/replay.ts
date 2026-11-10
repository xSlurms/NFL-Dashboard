// Replays a recording from `npm run record:live` as if it were happening now. Dev server only:
// this file and the fixtures it reads are never part of the production build.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { BigPlayRules } from "../shared/bigPlayRules.ts";
import type { FantasyMatchup, PlaysResponse, Scoreboard } from "../shared/types.ts";
import { detectBigPlays } from "../server/espn/detectBigPlays.ts";
import type { EspnCorePlayList, EspnFantasyLeague, EspnSummary } from "../server/espn/espnTypes.ts";
import { normalizeFantasy } from "../server/espn/normalizeFantasy.ts";
import { normalizeScoreboard } from "../server/espn/normalizeScoreboard.ts";

const KINDS = ["summary", "core", "scoreboard", "fantasy"] as const;
type Kind = (typeof KINDS)[number];

export interface Snapshot {
  time: number; // ms since epoch
  path: string;
}

export interface Recording {
  dir: string;
  gameId: string;
  start: number;
  end: number;
  snapshots: Record<Kind, Snapshot[]>;
}

export interface ReplayMeta {
  dir: string;
  gameId: string;
  start: string;
  end: string;
}

export class ReplayError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DIR_PATTERN = /^fixtures\/live\/(\d{1,12})$/;
const FINISHED_DIR = "fixtures/nfl";

/** "summary-2026-11-10T01-10-00-078Z.json.gz" -> its time. */
export function timeFromFilename(name: string): number | null {
  const m = name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
}

/** The latest snapshot taken at or before `t`, or null if `t` is before the first. */
export function snapshotAt(list: Snapshot[], t: number): Snapshot | null {
  let lo = 0;
  let hi = list.length - 1;
  let found: Snapshot | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].time <= t) {
      found = list[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const recordings = new Map<string, Recording>();

/** Only folders under fixtures/live/<gameId> can be opened, so the URL can't reach other files. */
export function openRecording(dir: string, root = process.cwd()): Recording {
  const match = dir.match(DIR_PATTERN);
  if (!match) throw new ReplayError(400, "replay must look like fixtures/live/<gameId>");
  const cached = recordings.get(dir);
  if (cached) return cached;
  const full = `${root}/${dir}`;
  if (!existsSync(full)) throw new ReplayError(404, `No recording at ${dir}`);

  const snapshots = Object.fromEntries(KINDS.map((k) => [k, [] as Snapshot[]])) as Record<Kind, Snapshot[]>;
  for (const name of readdirSync(full)) {
    const kind = KINDS.find((k) => name.startsWith(`${k}-`));
    const time = timeFromFilename(name);
    if (kind && time !== null) snapshots[kind].push({ time, path: `${full}/${name}` });
  }
  for (const list of Object.values(snapshots)) list.sort((a, b) => a.time - b.time);
  if (snapshots.summary.length === 0 || snapshots.scoreboard.length === 0) {
    throw new ReplayError(404, `${dir} has no summary or scoreboard snapshots`);
  }
  const all = Object.values(snapshots).flat().map((s) => s.time);
  const recording = { dir, gameId: match[1], start: Math.min(...all), end: Math.max(...all), snapshots };
  recordings.set(dir, recording);
  return recording;
}

export const replayMeta = (rec: Recording): ReplayMeta => ({
  dir: rec.dir,
  gameId: rec.gameId,
  start: new Date(rec.start).toISOString(),
  end: new Date(rec.end).toISOString(),
});

const readGz = <T>(path: string): T => JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
const readPlain = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));

export function replayScoreboard(rec: Recording, t: number): Scoreboard {
  const snap = snapshotAt(rec.snapshots.scoreboard, t) ?? rec.snapshots.scoreboard[0];
  return normalizeScoreboard(readGz(snap.path));
}

/**
 * The recorded game is replayed from its snapshots. Other games that week are already final in the
 * recording, so they come from the finished-game fixtures, if present.
 */
export function replayPlays(rec: Recording, t: number, gameIds: string[], rules: BigPlayRules, root = process.cwd()): PlaysResponse {
  const body: PlaysResponse = { games: [], errors: [] };
  for (const gameId of gameIds) {
    if (gameId === rec.gameId) {
      const summary = snapshotAt(rec.snapshots.summary, t);
      if (!summary) continue; // before the first snapshot: nothing has happened yet
      const coreSnap = snapshotAt(rec.snapshots.core, t);
      const finalCore = `${root}/${FINISHED_DIR}/core-plays-${gameId}.json`;
      // Older recordings have no core snapshots; the final list only adds names to plays that already exist.
      const core = coreSnap ? readGz<EspnCorePlayList>(coreSnap.path) : existsSync(finalCore) ? readPlain<EspnCorePlayList>(finalCore) : null;
      body.games.push({ gameId, plays: detectBigPlays(readGz<EspnSummary>(summary.path), core, rules), playersFromCoreApi: core !== null });
      continue;
    }
    const summaryPath = `${root}/${FINISHED_DIR}/summary-${gameId}.json`;
    if (!existsSync(summaryPath)) {
      body.errors.push({ gameId, message: "No fixture for this game" });
      continue;
    }
    const corePath = `${root}/${FINISHED_DIR}/core-plays-${gameId}.json`;
    const core = existsSync(corePath) ? readPlain<EspnCorePlayList>(corePath) : null;
    body.games.push({ gameId, plays: detectBigPlays(readPlain<EspnSummary>(summaryPath), core, rules), playersFromCoreApi: core !== null });
  }
  return body;
}

export function replayFantasy(rec: Recording, t: number, teamId: number, leagueId: string): FantasyMatchup {
  const list = rec.snapshots.fantasy;
  if (list.length === 0) throw new ReplayError(404, `${rec.dir} has no fantasy snapshots`);
  const raw = readGz<EspnFantasyLeague>((snapshotAt(list, t) ?? list[0]).path);
  const week = raw.scoringPeriodId ?? 1;
  return normalizeFantasy(raw, { leagueId, teamId, week, matchupPeriod: raw.status?.currentMatchupPeriod ?? week });
}
