// Format checks for ESPN fantasy identifiers and cookies, shared by the page and the functions.
// They also keep anything that could break a Cookie header (";", newlines) from ever reaching one.

export const isLeagueId = (s: string) => /^\d{1,12}$/.test(s);
export const isTeamId = (n: number) => Number.isInteger(n) && n >= 1 && n <= 999;
export const isSeason = (n: number) => Number.isInteger(n) && n >= 2000 && n <= 2100;

/** espn_s2 is a long URL-encoded token. */
export const isEspnS2 = (s: string) => /^[A-Za-z0-9%+/=._-]{20,4096}$/.test(s);

/** SWID is a GUID, normally in curly braces. Returns it with braces, or null if it isn't one. */
export function normalizeSwid(input: string): string | null {
  const inner = input.trim().replace(/^\{/, "").replace(/\}$/, "");
  return /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(inner) ? `{${inner}}` : null;
}

/** Request headers that carry a private league's cookies from the page to the fantasy function. */
export const ESPN_S2_HEADER = "X-Espn-S2";
export const ESPN_SWID_HEADER = "X-Espn-Swid";
