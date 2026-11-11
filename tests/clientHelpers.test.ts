import { afterEach, describe, expect, it, vi } from "vitest";
import { rulesQuery } from "../src/client/api.ts";
import { orderGames, playerGameStatus, startersInGame } from "../src/client/matchupJoin.ts";
import { ReplayClock } from "../src/client/replaySource.ts";
import { DEFAULT_SETTINGS, parseSettings } from "../src/client/settings.ts";
import { rulesFromQuery } from "../src/server/api/handlers.ts";
import { normalizeScoreboard } from "../src/server/espn/normalizeScoreboard.ts";
import type { FantasyTeam, RosterSlot } from "../src/shared/types.ts";
import { NFL_DIR, readJson } from "./fixtures.ts";

describe("settings", () => {
  it("falls back to defaults for missing, broken or out-of-range values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ pollSeconds: 3, rules: { longRushYards: 0, longCatchYards: 1.5, fumbles: "some" }, sound: "yes" })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values", () => {
    const custom = {
      rules: { longRushYards: 30, longCatchYards: 50, fumbles: "lost" as const, fieldGoals: { made: false, missed: true } },
      pollSeconds: 30 as const,
      notifications: true,
      sound: true,
      tickerFilter: "mine" as const,
      teams: [{ leagueId: "338094", teamId: 7, season: 2026, key: "338094:7:2026", name: "Seven", espnS2: null, swid: null }],
      activeTeam: "338094:7:2026",
    };
    expect(parseSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });

  it("sends rules in the form the plays function reads", () => {
    const rules = { longRushYards: 30, longCatchYards: 50, fumbles: "none" as const, fieldGoals: { made: false, missed: true } };
    expect(rulesFromQuery(new URL(`http://x/api/plays?${rulesQuery(rules)}`))).toEqual(rules);
  });
});

describe("matchupJoin", () => {
  const week10 = normalizeScoreboard(readJson(`${NFL_DIR}/scoreboard-week10-pre.json`));
  const week9 = normalizeScoreboard(readJson(`${NFL_DIR}/scoreboard.json`));
  const slot = (proTeamId: string): RosterSlot => ({ slot: "WR", espnId: "1", name: "", position: "WR", proTeamId, proTeam: "", points: 0, projectedPoints: null });

  it("labels each player's game: upcoming, final, bye, or none", () => {
    expect(playerGameStatus(week10, "28")).toMatchObject({ kind: "pre", label: expect.stringMatching(/^@ NYG · \w{3} /) }); // WSH at NYG
    expect(playerGameStatus(week10, "3")).toMatchObject({ kind: "bye", label: "Bye" }); // CHI
    expect(playerGameStatus(week9, "16")).toMatchObject({ kind: "post", label: "vs BUF · Final" }); // MIN hosted BUF
    expect(playerGameStatus(week9, "0").kind).toBe("none"); // free agent
    expect(playerGameStatus(null, "16").kind).toBe("none");
  });

  it("counts a team's starters in a game", () => {
    const game = week9.games.find((g) => g.id === "401873051")!;
    const team = { starters: [slot("2"), slot("16"), slot("16"), slot("8")] } as FantasyTeam;
    expect(startersInGame(game, team)).toBe(3);
    expect(startersInGame(game, null)).toBe(0);
  });

  it("puts live games first, then upcoming, then final", () => {
    const games = [...week9.games.slice(0, 2), { ...week9.games[2], state: "in" as const }, { ...week9.games[3], state: "pre" as const }];
    expect(orderGames(games).map((g) => g.state)).toEqual(["in", "pre", "post", "post"]);
  });
});

describe("ReplayClock", () => {
  afterEach(() => vi.useRealTimers());

  it("runs at its speed, pauses, and clamps seeks to the recording", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const clock = new ReplayClock(0, 3_600_000);
    expect(clock.now()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(clock.now()).toBe(10_000); // default 10x
    clock.setSpeed(60);
    vi.advanceTimersByTime(1000);
    expect(clock.now()).toBe(70_000);
    clock.togglePause();
    vi.advanceTimersByTime(5000);
    expect(clock.now()).toBe(70_000);
    clock.togglePause();
    clock.seek(99_999_999);
    expect(clock.now()).toBe(3_600_000);
    expect(clock.epoch).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(clock.now()).toBe(3_600_000); // stops at the end
  });

  it("tells subscribers about changes", () => {
    const clock = new ReplayClock(0, 1000);
    const seen = vi.fn();
    const unsubscribe = clock.subscribe(seen);
    clock.seek(500);
    clock.setSpeed(1);
    unsubscribe();
    clock.togglePause();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
