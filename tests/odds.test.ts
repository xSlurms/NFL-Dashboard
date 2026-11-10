import { describe, expect, it } from "vitest";
import { mergeOdds } from "../src/client/useOdds.ts";
import { openRecording, replayOdds } from "../src/dev/replay.ts";
import type { EspnScoreboard } from "../src/server/espn/espnTypes.ts";
import { normalizeOdds } from "../src/server/espn/normalizeOdds.ts";
import type { GameOdds } from "../src/shared/types.ts";
import { LIVE_DIR, LIVE_GAME_ID, NFL_DIR, hasLive, readJson } from "./fixtures.ts";

describe("normalizeOdds", () => {
  it("reads the favorite's line for every upcoming game", () => {
    const odds = normalizeOdds(readJson(`${NFL_DIR}/scoreboard-week10-pre.json`));
    expect(odds.week).toBe(10);
    expect(odds.games).toHaveLength(14);
    expect(odds.games[0]).toEqual({ gameId: "401873052", favoriteTeamId: "19", favorite: "NYG", spread: -2.5, provider: "DraftKings" });
    for (const g of odds.games) {
      expect(g.spread).toBeLessThan(0);
      expect(g.favorite).toMatch(/^[A-Z]{2,4}$/);
    }
  });

  it("has nothing for finished games (ESPN drops the lines)", () => {
    expect(normalizeOdds(readJson(`${NFL_DIR}/scoreboard.json`)).games).toEqual([]);
  });

  const board = (odds: object): EspnScoreboard => ({
    week: { number: 3 },
    events: [
      {
        id: "1",
        date: "",
        competitions: [
          {
            competitors: [
              { homeAway: "home", team: { id: "16", abbreviation: "MIN" } },
              { homeAway: "away", team: { id: "2", abbreviation: "BUF" } },
            ],
            odds: [{ provider: { name: "DraftKings" }, ...odds }],
          },
        ],
      },
    ],
  });

  it("uses the favorite flags when the text isn't a line, flipping the home-side spread", () => {
    // ESPN's `spread` is from the home side: +3 means the away team is favored by 3.
    expect(normalizeOdds(board({ details: "", spread: 3, awayTeamOdds: { favorite: true } })).games[0]).toMatchObject({ favorite: "BUF", spread: -3 });
    expect(normalizeOdds(board({ spread: -6.5, homeTeamOdds: { favorite: true } })).games[0]).toMatchObject({ favorite: "MIN", spread: -6.5 });
  });

  it("reads a pick'em", () => {
    expect(normalizeOdds(board({ details: "EVEN" })).games[0]).toMatchObject({ favorite: null, favoriteTeamId: null, spread: 0 });
    expect(normalizeOdds(board({ spread: 0 })).games[0]).toMatchObject({ spread: 0 });
  });

  it("skips a game it can't make sense of", () => {
    expect(normalizeOdds(board({ details: "OFF" })).games).toEqual([]);
    expect(normalizeOdds(board({ details: "XYZ -3" })).games).toEqual([]); // not one of the two teams
  });
});

describe("mergeOdds", () => {
  const line = (gameId: string, spread: number): GameOdds => ({ gameId, favoriteTeamId: "1", favorite: "ATL", spread, provider: "DraftKings" });
  const empty = { week: null, byGame: {}, updatedAt: null };

  it("keeps a game's last line when the new response has none (it kicked off)", () => {
    const first = mergeOdds(empty, { week: 10, games: [line("a", -3), line("b", -7)] }, 1000);
    const second = mergeOdds(first, { week: 10, games: [line("a", -3.5)] }, 2000);
    expect(second.byGame.a.spread).toBe(-3.5);
    expect(second.byGame.b.spread).toBe(-7);
    expect(second.updatedAt).toBe(2000);
  });

  it("starts over for a new week", () => {
    const week10 = mergeOdds(empty, { week: 10, games: [line("a", -3)] }, 1000);
    const week11 = mergeOdds(week10, { week: 11, games: [line("c", -1)] }, 2000);
    expect(Object.keys(week11.byGame)).toEqual(["c"]);
    expect(week11.week).toBe(11);
  });
});

describe.skipIf(!hasLive)("replayOdds", () => {
  it("shows Monday's line before kickoff and none once the game is on", () => {
    const rec = openRecording(LIVE_DIR);
    const before = replayOdds(rec, rec.start).games.find((g) => g.gameId === LIVE_GAME_ID);
    expect(before).toMatchObject({ favorite: "BUF", spread: -3, provider: "DraftKings" });
    expect(replayOdds(rec, rec.start + 90 * 60_000).games.find((g) => g.gameId === LIVE_GAME_ID)).toBeUndefined();
  });
});
