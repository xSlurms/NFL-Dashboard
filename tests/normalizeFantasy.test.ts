import { describe, expect, it } from "vitest";
import type { EspnFantasyLeague, EspnFantasyRosterEntry } from "../src/server/espn/espnTypes.ts";
import { normalizeFantasy } from "../src/server/espn/normalizeFantasy.ts";
import type { FantasyMatchup } from "../src/shared/types.ts";
import { FULL_LEAGUE, hasFullLeague, hasLive, liveFiles, readGz, readJson } from "./fixtures.ts";

// A made-up league in ESPN's shape: the real one is git-ignored.
function entry(slot: number, playerId: number, name: string, position: number, proTeamId: number, points: number, projection?: number): EspnFantasyRosterEntry {
  return {
    lineupSlotId: slot,
    playerId,
    playerPoolEntry: {
      appliedStatTotal: points,
      player: {
        fullName: name,
        defaultPositionId: position,
        proTeamId,
        stats: [
          { statSourceId: 0, scoringPeriodId: 10, appliedTotal: points },
          ...(projection === undefined ? [] : [{ statSourceId: 1, scoringPeriodId: 10, appliedTotal: projection }]),
          { statSourceId: 1, scoringPeriodId: 9, appliedTotal: 99 }, // last week's projection: must be ignored
        ],
      },
    },
  };
}

const league: EspnFantasyLeague = {
  seasonId: 2026,
  scoringPeriodId: 10,
  teams: [
    { id: 4, name: "Team Four", abbrev: "FOUR", logo: "https://example.test/4.png" },
    { id: 7, name: "Team Seven", abbrev: "SVN" },
    { id: 9, name: "Team Nine", abbrev: "NINE" },
  ],
  schedule: [
    { matchupPeriodId: 9, home: { teamId: 4, totalPointsLive: 131 }, away: { teamId: 9, totalPointsLive: 78 } },
    {
      matchupPeriodId: 10,
      away: {
        teamId: 4,
        totalPoints: 0,
        totalPointsLive: 41.5,
        totalProjectedPointsLive: 118.23456,
        winProbability: 0.62,
        rosterForCurrentScoringPeriod: {
          entries: [
            // Out of order on purpose, like ESPN's list.
            entry(20, 101, "Bench Back", 2, 12, 0, 6),
            entry(17, 102, "Kicker Guy", 5, 8, 7, 8),
            entry(23, 103, "Flex Wideout", 3, 1, 3.5, 9.25),
            entry(0, 104, "Quarter Back", 1, 2, 12.4, 19),
            entry(2, 105, "Runner One", 2, 16, 8, 12),
            entry(4, 106, "Wide One", 3, 25, 0, 11),
            entry(21, 107, "Hurt Guy", 3, 0, 0),
            entry(2, 108, "Runner Two", 2, 33, 4.1, 10),
            entry(6, 109, "Tight End", 4, 22, 0, 7),
            entry(16, -16008, "Lions D/ST", 16, 8, 2, 6),
            entry(4, 110, "Wide Two", 3, 34, 4.5, 13),
          ],
        },
      },
      home: { teamId: 7, totalPointsLive: 30, rosterForCurrentScoringPeriod: { entries: [entry(0, 201, "Other QB", 1, 6, 30, 20)] } },
    },
    { matchupPeriodId: 10, home: { teamId: 9 }, away: { teamId: 11 } },
  ],
};

const target = { leagueId: "338094", teamId: 4, week: 10, matchupPeriod: 10 };

describe("normalizeFantasy", () => {
  const result = normalizeFantasy(league, target);

  it("finds my matchup for this week and my opponent", () => {
    expect(result).toMatchObject({ leagueId: "338094", season: 2026, week: 10 });
    expect(result.me).toMatchObject({
      teamId: 4,
      name: "Team Four",
      abbrev: "FOUR",
      logo: "https://example.test/4.png",
      totalPoints: 41.5, // live, not totalPoints (0 until the week is final)
      projectedPoints: 118.23,
      winProbability: 0.62,
    });
    expect(result.opponent).toMatchObject({ teamId: 7, name: "Team Seven", totalPoints: 30, logo: null, projectedPoints: null, winProbability: null });
  });

  it("orders starters QB, RB, RB, WR, WR, TE, FLEX, D/ST, K", () => {
    expect(result.me.starters.map((s) => s.slot)).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "D/ST", "K"]);
    expect(result.me.starters.map((s) => s.name).slice(1, 3)).toEqual(["Runner One", "Runner Two"]);
  });

  it("puts bench before IR", () => {
    expect(result.me.bench.map((s) => [s.slot, s.name])).toEqual([["BE", "Bench Back"], ["IR", "Hurt Guy"]]);
  });

  it("maps each player's position, team, points and this week's projection", () => {
    const byName = (name: string) => [...result.me.starters, ...result.me.bench].find((s) => s.name === name)!;
    expect(byName("Quarter Back")).toEqual({
      slot: "QB", espnId: "104", name: "Quarter Back", position: "QB", proTeamId: "2", proTeam: "BUF", points: 12.4, projectedPoints: 19,
    });
    expect(byName("Lions D/ST")).toMatchObject({ slot: "D/ST", espnId: "-16008", position: "D/ST", proTeamId: "8", proTeam: "DET" });
    expect(byName("Hurt Guy")).toMatchObject({ proTeamId: "0", proTeam: "FA", projectedPoints: null });
    expect(byName("Kicker Guy").position).toBe("K");
  });

  it("returns no opponent when I have no matchup this week", () => {
    const bye = normalizeFantasy(league, { ...target, matchupPeriod: 11 });
    expect(bye.opponent).toBeNull();
    expect(bye.me).toMatchObject({ teamId: 4, name: "Team Four", totalPoints: 0, starters: [], bench: [] });
  });

  it("finds me whether I'm home or away", () => {
    const home = normalizeFantasy(league, { ...target, week: 9, matchupPeriod: 9 });
    expect(home.me.totalPoints).toBe(131);
    expect(home.opponent?.teamId).toBe(9);
  });
});

/** Starters' points add up to ESPN's live team total, so the slots and points were read correctly. */
function expectTotalsAddUp(m: FantasyMatchup) {
  for (const team of [m.me, m.opponent!]) {
    const sum = team.starters.reduce((total, s) => total + s.points, 0);
    expect(sum).toBeCloseTo(team.totalPoints, 1);
  }
}

describe.skipIf(!hasLive)("normalizeFantasy: every live snapshot from Monday night", () => {
  const snapshots = liveFiles("fantasy")
    .map((file) => readGz<EspnFantasyLeague>(file))
    .filter((raw) => raw.schedule && raw.schedule.length <= 6) // the 1.2 MB polling payload, not the early full pulls
    .map((raw) => normalizeFantasy(raw, { leagueId: "338094", teamId: 4, week: 9, matchupPeriod: 9 }));

  it("reads a full lineup for both teams, and the starters add up to the live totals", () => {
    expect(snapshots.length).toBeGreaterThan(150); // the other ~200 files are full pulls from a second recorder
    for (const m of snapshots) {
      expect(m.opponent).not.toBeNull();
      for (const team of [m.me, m.opponent!]) {
        expect(team.starters.map((s) => s.slot)).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "D/ST", "K"]);
        for (const s of [...team.starters, ...team.bench]) {
          expect(s.name).not.toBe("Unknown player");
          expect(s.position).toMatch(/^(QB|RB|WR|TE|K|D\/ST)$/);
        }
      }
      expectTotalsAddUp(m);
    }
  });

  it("ends with the final result", () => {
    const last = snapshots.at(-1)!;
    expect([last.me.totalPoints, last.opponent!.totalPoints]).toEqual([131, 78]);
    expect(last.me.winProbability).toBeGreaterThan(0.95);
  });
});

describe.skipIf(!hasFullLeague)("normalizeFantasy: privacy, against the full league pull", () => {
  const raw = readJson(FULL_LEAGUE);
  const text = JSON.stringify(normalizeFantasy(raw, { leagueId: "338094", teamId: 4, week: 9, matchupPeriod: 9 }));

  it("leaves out every league member's ID and name", () => {
    expect(raw.members.length).toBeGreaterThan(0);
    for (const member of raw.members) {
      expect(text).not.toContain(member.id);
      for (const name of [member.displayName, member.firstName, member.lastName].filter((n: unknown) => typeof n === "string" && n.length > 2)) {
        expect(text).not.toContain(`"${name}"`);
      }
    }
    expect(text).not.toMatch(/\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}/i); // SWID shape
    expect(text).not.toContain("members");
  });
});
