import { describe, expect, it } from "vitest";
import { playTone, rowTags, scoreAfterLabel, shortName } from "../src/client/playRow.ts";
import type { BigPlay, BigPlayTag, Game } from "../src/shared/types.ts";

const play = (tags: BigPlayTag[], overrides: Partial<BigPlay> = {}): BigPlay => ({
  id: "1", gameId: "g", tags, primaryPlayer: null, secondaryPlayers: [], defenseTeamId: null, yards: null, description: "",
  rawText: "", quarter: 1, clock: "1:00", wallclock: null, scoreAfter: { home: 0, away: 0 }, status: "active", fantasyOwner: null, ...overrides,
});

describe("playTone", () => {
  it("colors a row by its most important tag", () => {
    expect(playTone(play(["TD", "LONG_CATCH"]))).toBe("td");
    expect(playTone(play(["PICK_SIX", "INT", "TD"]))).toBe("turnoverTd");
    expect(playTone(play(["FUMBLE_LOST", "TD"]))).toBe("turnoverTd");
    expect(playTone(play(["LONG_CATCH", "FUMBLE_LOST"]))).toBe("turnover");
    expect(playTone(play(["INT"]))).toBe("turnover");
    expect(playTone(play(["LONG_RUSH"]))).toBe("long");
    expect(playTone(play(["FG"]))).toBe("fg");
    expect(playTone(play(["LONG_CATCH", "FUMBLE"]))).toBe("long");
    expect(playTone(play(["FUMBLE"]))).toBe("fumbleKept");
    expect(playTone(play(["FG_MISS"]))).toBe("miss");
  });

  it("grays out an overturned play whatever it was", () => {
    expect(playTone(play(["TD"], { status: "overturned" }))).toBe("overturned");
  });
});

describe("shortName", () => {
  it("shortens the first name to an initial", () => {
    expect(shortName("CeeDee Lamb")).toBe("C. Lamb");
    expect(shortName("Amon-Ra St. Brown")).toBe("A. St. Brown");
    expect(shortName("Patrick Mahomes II")).toBe("P. Mahomes II");
  });

  it("leaves initials and single names alone", () => {
    expect(shortName("D.J. Moore")).toBe("D.J. Moore");
    expect(shortName("Jonathan")).toBe("Jonathan");
  });
});

describe("scoreAfterLabel", () => {
  const team = (abbreviation: string) => ({ id: abbreviation, abbreviation, name: "", score: 0, logo: "", record: null });
  const game = { home: team("NYG"), away: team("DAL") } as Game;

  it("puts the leader first", () => {
    expect(scoreAfterLabel(play([], { scoreAfter: { home: 14, away: 21 } }), game)).toBe("DAL 21–14");
    expect(scoreAfterLabel(play([], { scoreAfter: { home: 10, away: 3 } }), game)).toBe("NYG 10–3");
  });

  it("shows a tie and a game it can't find plainly", () => {
    expect(scoreAfterLabel(play([], { scoreAfter: { home: 7, away: 7 } }), game)).toBe("7–7");
    expect(scoreAfterLabel(play([], { scoreAfter: { home: 7, away: 3 } }), undefined)).toBe("3–7");
  });
});

describe("rowTags", () => {
  it("shows a pick six as one tag", () => {
    expect(rowTags(play(["TD", "INT", "PICK_SIX"]))).toEqual(["PICK_SIX"]);
    expect(rowTags(play(["TD", "LONG_CATCH"]))).toEqual(["TD", "LONG_CATCH"]);
  });
});
