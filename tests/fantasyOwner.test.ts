import { describe, expect, it } from "vitest";
import { fantasyOwnerOf, withFantasyOwners } from "../src/shared/fantasyOwner.ts";
import type { BigPlay, FantasyMatchup, FantasyTeam, LineupSlot, RosterSlot } from "../src/shared/types.ts";

const slot = (slot: LineupSlot, espnId: string, proTeamId: string): RosterSlot => ({
  slot, espnId, name: espnId, position: slot, proTeamId, proTeam: "", points: 0, projectedPoints: null,
});

const team = (teamId: number, starters: RosterSlot[], bench: RosterSlot[] = []): FantasyTeam => ({
  teamId, name: "", abbrev: "", logo: null, totalPoints: 0, projectedPoints: null, winProbability: null, starters, bench,
});

const matchup: FantasyMatchup = {
  leagueId: "1",
  season: 2026,
  week: 10,
  me: team(4, [slot("WR", "100", "1"), slot("K", "101", "2"), slot("D/ST", "-16008", "8")], [slot("BE", "102", "3")]),
  opponent: team(7, [slot("QB", "200", "1"), slot("D/ST", "-16030", "30")]),
};

const play = (overrides: Partial<BigPlay>): BigPlay => ({
  id: "1", gameId: "g", tags: ["TD"], primaryPlayer: null, secondaryPlayers: [], defenseTeamId: null, yards: null,
  description: "", rawText: "", quarter: 1, clock: "15:00", scoreAfter: { home: 0, away: 0 }, status: "active", fantasyOwner: null,
  ...overrides,
});

const player = (espnId: string, teamId = "1") => ({ espnId, name: espnId, position: "", team: "", teamId });
const secondary = (espnId: string, role: string) => ({ espnId, name: espnId, role, teamId: "1" });

describe("fantasyOwnerOf", () => {
  it("credits my starter as the headline player", () => {
    expect(fantasyOwnerOf(play({ primaryPlayer: player("101") }), matchup)).toBe("me");
  });

  it("prefers me when a play touches both teams (my WR catches the opponent's QB's pass)", () => {
    expect(fantasyOwnerOf(play({ primaryPlayer: player("100"), secondaryPlayers: [secondary("200", "passer")] }), matchup)).toBe("me");
  });

  it("credits the opponent through a secondary player", () => {
    expect(fantasyOwnerOf(play({ primaryPlayer: player("999"), secondaryPlayers: [secondary("200", "passer")] }), matchup)).toBe("opponent");
  });

  it("credits a D/ST through the defense team, not a player ID", () => {
    expect(fantasyOwnerOf(play({ tags: ["INT"], primaryPlayer: player("555", "8"), defenseTeamId: "8" }), matchup)).toBe("me");
    expect(fantasyOwnerOf(play({ tags: ["FUMBLE_LOST"], primaryPlayer: player("556", "6"), defenseTeamId: "30" }), matchup)).toBe("opponent");
    // A Lions offensive player's TD doesn't involve the Lions D/ST.
    expect(fantasyOwnerOf(play({ primaryPlayer: player("557", "8") }), matchup)).toBe("other");
  });

  it("ignores bench players", () => {
    expect(fantasyOwnerOf(play({ primaryPlayer: player("102") }), matchup)).toBe("other");
  });

  it("is null without a matchup, and handles a bye week", () => {
    expect(fantasyOwnerOf(play({ primaryPlayer: player("100") }), null)).toBeNull();
    expect(fantasyOwnerOf(play({ primaryPlayer: player("200") }), { ...matchup, opponent: null })).toBe("other");
  });

  it("withFantasyOwners leaves the input untouched", () => {
    const plays = [play({ primaryPlayer: player("100") })];
    expect(withFantasyOwners(plays, matchup)[0].fantasyOwner).toBe("me");
    expect(plays[0].fantasyOwner).toBeNull();
  });
});
