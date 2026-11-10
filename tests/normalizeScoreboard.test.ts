import { describe, expect, it } from "vitest";
import type { EspnScoreboard } from "../src/server/espn/espnTypes.ts";
import { PRO_TEAMS } from "../src/server/espn/normalizeFantasy.ts";
import { normalizeScoreboard } from "../src/server/espn/normalizeScoreboard.ts";
import { LIVE_GAME_ID, NFL_DIR, hasLive, liveFiles, readGz, readJson } from "./fixtures.ts";

const week9 = readJson<EspnScoreboard>(`${NFL_DIR}/scoreboard.json`);
const week10 = readJson<EspnScoreboard>(`${NFL_DIR}/scoreboard-week10-pre.json`);

describe("normalizeScoreboard: finished week (week 9)", () => {
  const board = normalizeScoreboard(week9);

  it("reads the week, season and byes", () => {
    expect(board).toMatchObject({ season: 2026, seasonType: 2, week: 9 });
    expect(board.byeTeamIds.sort()).toEqual(["10", "23"]); // TEN, PIT
    expect(board.games).toHaveLength(15);
  });

  it("marks every game final with its score and no live fields", () => {
    for (const game of board.games) {
      expect(game.state).toBe("post");
      expect(game.detail).toMatch(/^Final/);
      expect(game.quarter).toBeGreaterThanOrEqual(4);
      expect(game).toMatchObject({ clock: null, possessionTeamId: null, isRedZone: false, downDistance: null });
      expect(game.home.score + game.away.score).toBeGreaterThan(0);
      expect(game.home.record).toMatch(/^\d+-\d+(-\d+)?$/);
    }
  });

  it("keeps ESPN's scores", () => {
    const raw = week9.events!.find((e) => e.id === LIVE_GAME_ID)!.competitions[0].competitors;
    const game = board.games.find((g) => g.id === LIVE_GAME_ID)!;
    expect(game.home.score).toBe(Number(raw.find((c) => c.homeAway === "home")!.score));
    expect(game.away.score).toBe(Number(raw.find((c) => c.homeAway === "away")!.score));
    expect(`${game.away.abbreviation} @ ${game.home.abbreviation}`).toBe("BUF @ MIN");
  });

  it("sorts games by kickoff", () => {
    const times = board.games.map((g) => g.startTime);
    expect(times).toEqual([...times].sort());
  });
});

describe("normalizeScoreboard: upcoming week (week 10)", () => {
  const board = normalizeScoreboard(week10);

  it("shows scheduled games with no score, quarter or clock", () => {
    expect(board.week).toBe(10);
    expect(board.byeTeamIds.sort()).toEqual(["21", "27", "3", "7"]); // PHI, TB, CHI, DEN
    for (const game of board.games) {
      expect(game).toMatchObject({ state: "pre", quarter: null, clock: null, possessionTeamId: null });
      expect(game.home.score + game.away.score).toBe(0);
      expect(game.detail).toMatch(/(AM|PM)/);
    }
  });
});

describe("PRO_TEAMS (fantasy proTeamId to abbreviation)", () => {
  it("matches every team on the scoreboards, including byes", () => {
    const seen = new Map<string, string>();
    for (const raw of [week9, week10]) {
      for (const event of raw.events!) for (const c of event.competitions[0].competitors) seen.set(c.team.id, c.team.abbreviation);
    }
    expect(seen.size).toBe(32);
    for (const [id, abbreviation] of seen) expect(PRO_TEAMS[Number(id)]).toBe(abbreviation);
    expect(Object.keys(PRO_TEAMS)).toHaveLength(32);
  });
});

describe.skipIf(!hasLive)("normalizeScoreboard: live recording of BUF @ MIN", () => {
  const snapshots = liveFiles("scoreboard").map((file) => normalizeScoreboard(readGz(file)).games.find((g) => g.id === LIVE_GAME_ID)!);
  const live = snapshots.filter((g) => g.state === "in");

  it("has quarter and clock on every in-progress snapshot", () => {
    expect(live.length).toBeGreaterThan(300);
    for (const game of live) {
      expect(game.quarter).toBeGreaterThanOrEqual(1);
      expect(game.quarter).toBeLessThanOrEqual(5);
      expect(game.clock).toMatch(/^\d{1,2}:\d{2}$/);
    }
  });

  it("gives possession to one of the two teams, or null between possessions", () => {
    const teams = [snapshots[0].home.id, snapshots[0].away.id];
    for (const game of live) if (game.possessionTeamId) expect(teams).toContain(game.possessionTeamId);
    const withBall = live.filter((g) => g.possessionTeamId).length;
    expect(withBall).toBeGreaterThan(live.length * 0.7);
    expect(withBall).toBeLessThan(live.length); // ESPN drops it between possessions
  });

  it("reports red-zone trips, halftime and the final", () => {
    expect(live.some((g) => g.isRedZone && g.downDistance)).toBe(true);
    expect(live.some((g) => g.detail === "Halftime")).toBe(true);
    const last = snapshots.at(-1)!;
    expect(last.state).toBe("post");
    const final = normalizeScoreboard(week9).games.find((g) => g.id === LIVE_GAME_ID)!;
    expect([last.away.score, last.home.score]).toEqual([final.away.score, final.home.score]);
  });

  it("never runs the score backwards", () => {
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].home.score).toBeGreaterThanOrEqual(snapshots[i - 1].home.score);
      expect(snapshots[i].away.score).toBeGreaterThanOrEqual(snapshots[i - 1].away.score);
    }
  });
});
