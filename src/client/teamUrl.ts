// Saved fantasy teams, and reading league and team from an ESPN team link, e.g.
// https://fantasy.espn.com/football/team?leagueId=338094&teamId=4&seasonId=2026
import { ESPN_S2_HEADER, ESPN_SWID_HEADER, isEspnS2, isLeagueId, isSeason, isTeamId, normalizeSwid } from "../shared/espnIds.ts";

export interface TeamChoice {
  leagueId: string;
  teamId: number;
  season: number | null; // null: the server picks the current season
}

/** A team in the tabs. A private league carries its own cookies, kept only in this browser. */
export interface SavedTeam extends TeamChoice {
  key: string;
  name: string | null; // filled in from ESPN once the team loads
  espnS2: string | null;
  swid: string | null;
}

export const MAX_TEAMS = 12;

export const teamKey = (t: TeamChoice) => `${t.leagueId}:${t.teamId}:${t.season ?? ""}`;
export const isPrivateTeam = (t: TeamChoice | SavedTeam) => "espnS2" in t && !!t.espnS2 && !!t.swid;

export function parseTeamUrl(input: string): TeamChoice | { error: string } {
  const text = input.trim();
  if (!text) return { error: "Paste the address of your team page on ESPN Fantasy." };

  let params: URLSearchParams;
  let url: URL | null = null;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    url = null;
  }
  if (url && url.hostname.includes(".")) {
    if (!/(^|\.)espn\.com$/i.test(url.hostname)) return { error: "That isn't an ESPN link." };
    if (/\/(basketball|baseball|hockey|womens-basketball)\b/i.test(url.pathname)) return { error: "That's not a football league." };
    params = url.searchParams;
  } else {
    params = new URLSearchParams(text.replace(/^\?/, "")); // a bare "leagueId=...&teamId=..."
  }

  const leagueId = params.get("leagueId")?.trim() ?? "";
  const teamRaw = params.get("teamId")?.trim() ?? "";
  const seasonRaw = params.get("seasonId")?.trim() ?? "";
  if (!isLeagueId(leagueId)) return { error: "No league number in that link. Open your team page on ESPN Fantasy and copy its address." };
  if (!teamRaw) return { error: "That link has no team in it. Open your own team's page (not the league page) and copy its address." };
  const teamId = Number(teamRaw);
  if (!isTeamId(teamId)) return { error: "The team number in that link doesn't look right." };
  const season = seasonRaw ? Number(seasonRaw) : null;
  if (season !== null && !isSeason(season)) return { error: "The season in that link doesn't look right." };
  return { leagueId, teamId, season };
}

/** Checks the two cookies a private league needs. Returns them cleaned up, or what's wrong. */
export function parseCookies(espnS2: string, swid: string): { espnS2: string; swid: string } | { error: string } {
  const s2 = espnS2.trim().replace(/^espn_s2=/i, "");
  const id = normalizeSwid(swid.replace(/^swid=/i, ""));
  if (!s2 || !swid.trim()) return { error: "A private league needs both espn_s2 and SWID." };
  if (!isEspnS2(s2)) return { error: "That espn_s2 doesn't look right. It's a long string of letters, numbers and % signs." };
  if (!id) return { error: "That SWID doesn't look right. It looks like {1A2B3C4D-5E6F-…} with the curly braces." };
  return { espnS2: s2, swid: id };
}

/** Validates a saved team read back from storage; anything malformed is dropped. */
export function toSavedTeam(value: unknown): SavedTeam | null {
  const v = value as Partial<SavedTeam> | null;
  if (!v || typeof v.leagueId !== "string" || !isLeagueId(v.leagueId) || typeof v.teamId !== "number" || !isTeamId(v.teamId)) return null;
  const season = typeof v.season === "number" && isSeason(v.season) ? v.season : null;
  const cookies = typeof v.espnS2 === "string" && typeof v.swid === "string" ? parseCookies(v.espnS2, v.swid) : null;
  const choice = { leagueId: v.leagueId, teamId: v.teamId, season };
  return {
    ...choice,
    key: teamKey(choice),
    name: typeof v.name === "string" ? v.name.slice(0, 80) : null,
    espnS2: cookies && !("error" in cookies) ? cookies.espnS2 : null,
    swid: cookies && !("error" in cookies) ? cookies.swid : null,
  };
}

/** The query string for /api/fantasy. Never carries cookies: URLs end up in logs. */
export function teamQuery(team: TeamChoice | null | undefined): string {
  if (!team) return "";
  const params = new URLSearchParams({ leagueId: team.leagueId, teamId: String(team.teamId) });
  if (team.season) params.set("season", String(team.season));
  return `?${params}`;
}

/** Cookies for a private league travel in request headers instead. */
export function teamHeaders(team: TeamChoice | SavedTeam | null | undefined): Record<string, string> {
  if (!team || !("espnS2" in team) || !team.espnS2 || !team.swid) return {};
  return { [ESPN_S2_HEADER]: team.espnS2, [ESPN_SWID_HEADER]: team.swid };
}

export const teamLabel = (t: SavedTeam) => t.name ?? `League ${t.leagueId} · Team ${t.teamId}`;
