import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSource } from "../src/client/api.ts";
import { activeTeamOf, nameTeam, parseSettings, removeTeam, saveTeam } from "../src/client/settings.ts";
import { parseCookies, parseTeamUrl, teamKey, teamQuery, type SavedTeam } from "../src/client/teamUrl.ts";

describe("parseTeamUrl", () => {
  it.each([
    ["https://fantasy.espn.com/football/team?leagueId=338094&teamId=4", { leagueId: "338094", teamId: 4, season: null }],
    ["https://fantasy.espn.com/football/team?leagueId=338094&teamId=4&seasonId=2026", { leagueId: "338094", teamId: 4, season: 2026 }],
    ["Https://fantasy.espn.com/football/team?leagueId=338094&teamId=4", { leagueId: "338094", teamId: 4, season: null }],
    ["fantasy.espn.com/football/team?teamId=12&leagueId=777", { leagueId: "777", teamId: 12, season: null }],
    ["  https://www.espn.com/fantasy/football/team?leagueId=5&teamId=1&view=overview  ", { leagueId: "5", teamId: 1, season: null }],
    ["leagueId=338094&teamId=4", { leagueId: "338094", teamId: 4, season: null }],
  ])("reads %s", (input, expected) => {
    expect(parseTeamUrl(input)).toEqual(expected);
  });

  it.each([
    ["", "Paste"],
    ["https://example.com/football/team?leagueId=1&teamId=2", "isn't an ESPN link"],
    ["https://fantasy.espn.com/basketball/team?leagueId=1&teamId=2", "not a football league"],
    ["https://fantasy.espn.com/football/league?leagueId=338094", "no team"],
    ["https://fantasy.espn.com/football/team?teamId=4", "No league number"],
    ["https://fantasy.espn.com/football/team?leagueId=1&teamId=abc", "team number"],
    ["https://fantasy.espn.com/football/team?leagueId=1&teamId=2&seasonId=99", "season"],
    ["just some words", "No league number"],
  ])("explains what's wrong with %s", (input, message) => {
    const result = parseTeamUrl(input);
    expect("error" in result && result.error).toContain(message);
  });
});

const S2 = "AEBx%2Fabc123%3D%3Dmore%2Bstuff0123456789";
const SWID = "1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D";
const team = (leagueId: string, teamId: number, extra: Partial<SavedTeam> = {}): SavedTeam => {
  const choice = { leagueId, teamId, season: null };
  return { ...choice, key: teamKey(choice), name: null, espnS2: null, swid: null, ...extra };
};

describe("parseCookies", () => {
  it("cleans up pasted values", () => {
    expect(parseCookies(` ${S2} `, SWID)).toEqual({ espnS2: S2, swid: `{${SWID}}` }); // braces added
    expect(parseCookies(`espn_s2=${S2}`, `SWID={${SWID}}`)).toEqual({ espnS2: S2, swid: `{${SWID}}` }); // "name=" prefixes dropped
  });

  it.each([
    ["", SWID, "both"],
    [S2, "", "both"],
    ["short", SWID, "espn_s2"],
    [`${S2}; other=1`, SWID, "espn_s2"], // would break the Cookie header
    [S2, "not-a-guid", "SWID"],
  ])("rejects %s / %s", (s2, swid, message) => {
    const result = parseCookies(s2, swid);
    expect("error" in result && result.error).toContain(message);
  });
});

describe("saved teams in settings", () => {
  it("turns the earlier single `team` setting into the first tab", () => {
    const s = parseSettings({ team: { leagueId: "338094", teamId: 4, season: null } });
    expect(s.teams).toEqual([team("338094", 4)]);
    expect(s.activeTeam).toBe("338094:4:");
  });

  it("keeps valid teams, drops broken ones and duplicates, and falls back to the first tab", () => {
    const s = parseSettings({
      teams: [
        { leagueId: "1", teamId: 2, season: null, name: "One" },
        { leagueId: "1", teamId: 2, season: null }, // duplicate
        { leagueId: "../x", teamId: 4, season: null },
        { leagueId: "3", teamId: 4000, season: null },
        { leagueId: "5", teamId: 6, season: 2025, espnS2: S2, swid: SWID },
      ],
      activeTeam: "gone",
    });
    expect(s.teams.map((t) => t.key)).toEqual(["1:2:", "5:6:2025"]);
    expect(s.teams[1]).toMatchObject({ espnS2: S2, swid: `{${SWID}}` });
    expect(s.activeTeam).toBe("1:2:");
  });

  it("drops cookies that don't look right rather than ever sending them", () => {
    const s = parseSettings({ teams: [{ leagueId: "1", teamId: 2, season: null, espnS2: `${S2};x=1`, swid: SWID }] });
    expect(s.teams[0]).toMatchObject({ espnS2: null, swid: null });
  });

  it("starts with no team at all, then adds and selects each new one", () => {
    expect(activeTeamOf(parseSettings({}))).toBeNull();
    let s = saveTeam(parseSettings({}), team("999", 3));
    expect(s.teams.map((t) => t.key)).toEqual(["999:3:"]);
    s = saveTeam(s, team("338094", 4));
    expect(s.teams.map((t) => t.key)).toEqual(["999:3:", "338094:4:"]);
    expect(activeTeamOf(s)?.leagueId).toBe("338094");
  });

  it("replaces a team when it's saved again (an edit)", () => {
    let s = saveTeam(parseSettings({}), team("338094", 4));
    s = saveTeam(s, team("338094", 4, { espnS2: S2, swid: `{${SWID}}` }));
    expect(s.teams).toHaveLength(1);
    expect(s.teams[0].espnS2).toBe(S2);
  });

  it("removes a team and selects the next one", () => {
    let s = saveTeam(saveTeam(parseSettings({}), team("1", 1)), team("2", 2));
    s = removeTeam(s, "2:2:");
    expect(s.teams.map((t) => t.key)).toEqual(["1:1:"]);
    expect(s.activeTeam).toBe("1:1:");
    expect(removeTeam(s, "1:1:")).toMatchObject({ teams: [], activeTeam: null });
  });

  it("updates a tab's name only when it changed", () => {
    const s = saveTeam(parseSettings({}), team("1", 1));
    const named = nameTeam(s, "1:1:", "Gridiron Gang");
    expect(named.teams[0].name).toBe("Gridiron Gang");
    expect(nameTeam(named, "1:1:", "Gridiron Gang")).toBe(named);
  });
});

describe("requests for a team", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the team in the query and a private league's cookies only in headers", async () => {
    expect(teamQuery(null)).toBe("");
    expect(teamQuery({ leagueId: "9", teamId: 2, season: 2025 })).toBe("?leagueId=9&teamId=2&season=2025");
    const seen: { path: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
      seen.push({ path, headers: new Headers(init.headers) });
      return new Response("{}");
    });
    await liveSource.fantasy(team("338094", 7));
    await liveSource.fantasy(team("555", 1, { espnS2: S2, swid: `{${SWID}}` }));
    await liveSource.fantasy(null);
    expect(seen.map((s) => s.path)).toEqual(["/api/fantasy?leagueId=338094&teamId=7", "/api/fantasy?leagueId=555&teamId=1", "/api/fantasy"]);
    expect(seen[0].headers.has("X-Espn-S2")).toBe(false);
    expect(seen[1].headers.get("X-Espn-S2")).toBe(S2);
    expect(seen[1].headers.get("X-Espn-Swid")).toBe(`{${SWID}}`);
    expect(seen.every((s) => !s.path.includes("AEB") && !s.path.includes(SWID))).toBe(true);
  });
});
