import { describe, expect, it } from "vitest";
import { FINAL_SWEEP_MS, IDLE_POLL_MS, emptyWatch, gamesToFetch, markFetched, pollDelay, rememberPossession } from "../src/client/schedule.ts";
import type { Game, GameState } from "../src/shared/types.ts";

const team = (id: string) => ({ id, abbreviation: id, name: id, score: 0, logo: "", record: null });
const game = (id: string, state: GameState, overrides: Partial<Game> = {}): Game => ({
  id, startTime: "2026-11-15T18:00:00Z", state, quarter: null, clock: null, detail: "", home: team(`${id}h`), away: team(`${id}a`),
  possessionTeamId: null, isRedZone: false, downDistance: null, lastPlay: null, ...overrides,
});
const ok = (ids: string[]) => ({ games: ids.map((gameId) => ({ gameId, plays: [], playersFromCoreApi: true })), errors: [] });

describe("gamesToFetch", () => {
  it("skips games not started, fetches live ones every time, and final ones once", () => {
    const games = [game("pre", "pre"), game("live", "in"), game("done", "post")];
    let { ids, watch } = gamesToFetch(games, emptyWatch(), 0);
    expect(ids).toEqual(["live", "done"]);
    watch = markFetched(watch, games, ok(ids));
    expect(gamesToFetch(games, watch, 1000).ids).toEqual(["live"]);
  });

  it("keeps a final game until it's actually fetched", () => {
    const games = [game("done", "post")];
    const { watch } = gamesToFetch(games, emptyWatch(), 0);
    const failed = markFetched(watch, games, { games: [], errors: [{ gameId: "done", message: "x" }] });
    expect(gamesToFetch(games, failed, 1000).ids).toEqual(["done"]);
  });

  it("keeps polling a game for 10 minutes after it's seen going final", () => {
    let watch = gamesToFetch([game("g", "in")], emptyWatch(), 0).watch;
    const ended = [game("g", "post")];
    let plan = gamesToFetch(ended, watch, 1000);
    expect(plan.ids).toEqual(["g"]);
    watch = markFetched(plan.watch, ended, ok(["g"]));
    plan = gamesToFetch(ended, watch, 1000 + FINAL_SWEEP_MS - 1);
    expect(plan.ids).toEqual(["g"]);
    expect(gamesToFetch(ended, plan.watch, 1000 + FINAL_SWEEP_MS + 1).ids).toEqual([]);
  });
});

describe("pollDelay", () => {
  const now = Date.parse("2026-11-15T17:00:00Z");
  it("polls fast while a game is live, about to start, or in its final sweep", () => {
    expect(pollDelay([game("g", "in")], emptyWatch(), now, 15_000)).toBe(15_000);
    expect(pollDelay([game("g", "pre", { startTime: "2026-11-15T17:05:00Z" })], emptyWatch(), now, 15_000)).toBe(15_000);
    const watch = { ...emptyWatch(), sweepUntil: new Map([["g", now + 1000]]) };
    expect(pollDelay([game("g", "post")], watch, now, 15_000)).toBe(15_000);
  });

  it("slows to 5 minutes otherwise", () => {
    expect(pollDelay([game("g", "pre"), game("h", "post")], emptyWatch(), now, 15_000)).toBe(IDLE_POLL_MS);
    expect(pollDelay([], emptyWatch(), now, 15_000)).toBe(IDLE_POLL_MS);
  });
});

describe("rememberPossession", () => {
  it("keeps the last team with the ball while ESPN has none, and forgets finished games", () => {
    let memory = rememberPossession({}, [game("g", "in", { possessionTeamId: "2" })]);
    expect(memory).toEqual({ g: "2" });
    memory = rememberPossession(memory, [game("g", "in", { possessionTeamId: null })]);
    expect(memory).toEqual({ g: "2" });
    memory = rememberPossession(memory, [game("g", "in", { possessionTeamId: "16" })]);
    expect(memory).toEqual({ g: "16" });
    expect(rememberPossession(memory, [game("g", "post")])).toEqual({});
  });
});
