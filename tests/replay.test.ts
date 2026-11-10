import { describe, expect, it } from "vitest";
import { ReplayError, openRecording, replayFantasy, replayMeta, replayPlays, replayScoreboard, snapshotAt, timeFromFilename } from "../src/dev/replay.ts";
import { detectBigPlays } from "../src/server/espn/detectBigPlays.ts";
import { DEFAULT_RULES } from "../src/shared/bigPlayRules.ts";
import { LIVE_DIR, LIVE_GAME_ID, NFL_DIR, hasLive, readJson } from "./fixtures.ts";

describe("replay helpers", () => {
  it("reads the time from a snapshot file name", () => {
    expect(timeFromFilename("summary-2026-11-10T01-10-00-078Z.json.gz")).toBe(Date.parse("2026-11-10T01:10:00.078Z"));
    expect(timeFromFilename("notes.txt")).toBeNull();
  });

  it("finds the latest snapshot at or before a time", () => {
    const list = [10, 20, 30].map((time) => ({ time, path: String(time) }));
    expect(snapshotAt(list, 5)).toBeNull();
    expect(snapshotAt(list, 10)?.time).toBe(10);
    expect(snapshotAt(list, 29)?.time).toBe(20);
    expect(snapshotAt(list, 99)?.time).toBe(30);
    expect(snapshotAt([], 99)).toBeNull();
  });

  it.each(["../.env", "fixtures/fantasy", "fixtures/live/../../.env", "fixtures/live/abc", "C:/Windows"])("refuses to open %s", (dir) => {
    expect(() => openRecording(dir)).toThrow(ReplayError);
  });

  it("reports a missing recording as 404", () => {
    expect(() => openRecording("fixtures/live/999999999")).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe.skipIf(!hasLive)("replaying Monday night", () => {
  const rec = openRecording(LIVE_DIR);
  const meta = replayMeta(rec);

  it("spans the recording", () => {
    expect(meta.gameId).toBe(LIVE_GAME_ID);
    expect(Date.parse(meta.end) - Date.parse(meta.start)).toBeGreaterThan(3 * 60 * 60_000);
  });

  it("starts before kickoff and ends final", () => {
    const at = (t: number) => replayScoreboard(rec, t).games.find((g) => g.id === LIVE_GAME_ID)!;
    expect(at(rec.start).state).toBe("pre");
    expect(at(rec.start + 90 * 60_000).state).toBe("in");
    expect(at(rec.end).state).toBe("post");
  });

  it("has no plays before kickoff and the final set at the end", () => {
    expect(replayPlays(rec, rec.start - 1, [LIVE_GAME_ID], DEFAULT_RULES).games).toEqual([]);
    const end = replayPlays(rec, rec.end, [LIVE_GAME_ID], DEFAULT_RULES).games[0];
    const final = detectBigPlays(readJson(`${NFL_DIR}/summary-${LIVE_GAME_ID}.json`), readJson(`${NFL_DIR}/core-plays-${LIVE_GAME_ID}.json`));
    expect(end.plays.map((p) => [p.id, p.status])).toEqual(final.map((p) => [p.id, p.status]));
  });

  it("serves other games from the finished-game fixtures, and names missing ones", () => {
    const body = replayPlays(rec, rec.start, ["401873037", "123"], DEFAULT_RULES);
    expect(body.games.map((g) => g.gameId)).toEqual(["401873037"]);
    expect(body.errors).toEqual([{ gameId: "123", message: "No fixture for this game" }]);
  });

  it("replays the fantasy matchup for any team in the league", () => {
    const end = replayFantasy(rec, rec.end, 4, "338094");
    expect([end.me.totalPoints, end.opponent?.totalPoints]).toEqual([131, 78]);
    expect(replayFantasy(rec, rec.end, 20, "338094").me.teamId).toBe(20);
  });
});
