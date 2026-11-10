import { describe, expect, it } from "vitest";
import { emptyStore, mergePlays, sortedItems } from "../src/client/playStore.ts";
import { detectBigPlays } from "../src/server/espn/detectBigPlays.ts";
import type { BigPlay, PlaysResponse } from "../src/shared/types.ts";
import { LIVE_GAME_ID, NFL_DIR, hasLive, liveFiles, readGz, readJson } from "./fixtures.ts";

const play = (id: string, overrides: Partial<BigPlay> = {}): BigPlay => ({
  id, gameId: "g1", tags: ["TD"], primaryPlayer: null, secondaryPlayers: [], defenseTeamId: null, yards: null, description: id,
  rawText: "", quarter: 1, clock: "10:00", wallclock: null, scoreAfter: { home: 0, away: 0 }, status: "active", fantasyOwner: null,
  ...overrides,
});
const response = (gameId: string, plays: BigPlay[]): PlaysResponse => ({ games: [{ gameId, plays, playersFromCoreApi: true }], errors: [] });

describe("mergePlays", () => {
  it("shows plays from a game's first fetch without alerting on them", () => {
    const { store, added } = mergePlays(emptyStore(), response("g1", [play("a"), play("b")]), 1000);
    expect([...store.items.keys()]).toEqual(["a", "b"]);
    expect(added).toEqual([]);
  });

  it("alerts on plays that appear in later fetches, once", () => {
    let { store } = mergePlays(emptyStore(), response("g1", [play("a")]), 1000);
    const second = mergePlays(store, response("g1", [play("a"), play("b")]), 2000);
    expect(second.added.map((p) => p.id)).toEqual(["b"]);
    expect(second.store.items.get("b")!.firstSeenAt).toBe(2000);
    store = second.store;
    expect(mergePlays(store, response("g1", [play("a"), play("b")]), 3000).added).toEqual([]);
  });

  it("doesn't alert on a new play that is already overturned", () => {
    const { store } = mergePlays(emptyStore(), response("g1", []), 1000);
    expect(mergePlays(store, response("g1", [play("x", { status: "overturned" })]), 2000).added).toEqual([]);
  });

  it("keeps corrections and reports a play turning overturned", () => {
    const { store } = mergePlays(emptyStore(), response("g1", [play("a", { yards: 55 })]), 1000);
    const corrected = mergePlays(store, response("g1", [play("a", { yards: 54 })]), 2000);
    expect(corrected.store.items.get("a")!.play.yards).toBe(54);
    expect(corrected.store.items.get("a")!.firstSeenAt).toBe(1000);
    expect(corrected.overturned).toEqual([]);

    const reversed = mergePlays(corrected.store, response("g1", [play("a", { status: "overturned" })]), 3000);
    expect(reversed.overturned.map((p) => p.id)).toEqual(["a"]);
    expect(mergePlays(reversed.store, response("g1", [play("a", { status: "overturned" })]), 4000).overturned).toEqual([]);
  });

  it("marks a play ESPN dropped as overturned instead of deleting it", () => {
    const { store } = mergePlays(emptyStore(), response("g1", [play("a"), play("b")]), 1000);
    const next = mergePlays(store, response("g1", [play("b")]), 2000);
    expect(next.store.items.get("a")!.play.status).toBe("overturned");
    expect(next.overturned.map((p) => p.id)).toEqual(["a"]);
  });

  it("leaves other games alone, including ones that failed this time", () => {
    let { store } = mergePlays(emptyStore(), response("g1", [play("a")]), 1000);
    store = mergePlays(store, response("g2", [play("z", { gameId: "g2" })]), 1000).store;
    const next = mergePlays(store, { games: [], errors: [{ gameId: "g1", message: "boom" }] }, 2000);
    expect(next.store.items.get("a")!.play.status).toBe("active");
    expect(next.store.items.size).toBe(2);
  });

  it("doesn't change the store it was given", () => {
    const store = emptyStore();
    mergePlays(store, response("g1", [play("a")]), 1000);
    expect(store.items.size).toBe(0);
  });
});

describe("sortedItems", () => {
  it("orders by play time across games, newest first", () => {
    const { store } = mergePlays(
      emptyStore(),
      {
        games: [
          { gameId: "g1", plays: [play("early", { wallclock: "2026-11-09T18:00:00Z" }), play("late", { wallclock: "2026-11-09T20:00:00Z" })], playersFromCoreApi: true },
          { gameId: "g2", plays: [play("middle", { gameId: "g2", wallclock: "2026-11-09T19:00:00Z" })], playersFromCoreApi: true },
        ],
        errors: [],
      },
      1000,
    );
    expect(sortedItems(store).map((i) => i.play.id)).toEqual(["late", "middle", "early"]);
  });
});

describe.skipIf(!hasLive)("mergePlays over Monday night's recording", () => {
  // Feed every 30-second summary through the detector and the store, the way the page polls.
  const snapshots = liveFiles("summary");
  const core = readJson(`${NFL_DIR}/core-plays-${LIVE_GAME_ID}.json`);

  it("ends with every final big play, alerts on each new one once, and reports the overturned fumble", () => {
    let store = emptyStore();
    const alerted: string[] = [];
    const overturned: string[] = [];
    snapshots.forEach((file, i) => {
      const result = mergePlays(store, { games: [{ gameId: LIVE_GAME_ID, plays: detectBigPlays(readGz(file), core), playersFromCoreApi: true }], errors: [] }, i);
      store = result.store;
      alerted.push(...result.added.map((p) => p.id));
      overturned.push(...result.overturned.map((p) => p.id));
    });

    const final = detectBigPlays(readJson(`${NFL_DIR}/summary-${LIVE_GAME_ID}.json`), core);
    for (const p of final) expect(store.items.get(p.id)?.play.status).toBe(p.status);
    expect(new Set(alerted).size).toBe(alerted.length);
    expect(alerted.length).toBeGreaterThanOrEqual(final.filter((p) => p.status === "active").length - 1);
    expect(overturned).toContain("4018730511609"); // the sack-fumble reversed on review
  });
});
