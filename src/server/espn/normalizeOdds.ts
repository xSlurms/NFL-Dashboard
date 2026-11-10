import type { GameOdds, OddsResponse } from "../../shared/types.ts";
import type { EspnEvent, EspnScoreboard } from "./espnTypes.ts";

const PICKEM = /^(even|pk|pick|pick'?em)$/i;
const FAVORITE_LINE = /^([A-Z]{2,4})\s+(-\d+(?:\.\d+)?)$/;

/** The favorite's point spread for each game on the scoreboard that still has a line. */
export function normalizeOdds(raw: EspnScoreboard): OddsResponse {
  const games = (raw.events ?? []).map(oddsFor).filter((g): g is GameOdds => g !== null);
  return { week: raw.week?.number ?? 0, games };
}

function oddsFor(event: EspnEvent): GameOdds | null {
  const competition = event.competitions[0];
  const line = competition.odds?.[0];
  if (!line) return null;
  const provider = line.provider?.name ?? "ESPN";
  const home = competition.competitors.find((c) => c.homeAway === "home")?.team;
  const away = competition.competitors.find((c) => c.homeAway === "away")?.team;
  const details = line.details?.trim() ?? "";
  const pickem: GameOdds = { gameId: event.id, favoriteTeamId: null, favorite: null, spread: 0, provider };

  // "NYG -2.5" is what ESPN shows, so read it first.
  if (PICKEM.test(details)) return pickem;
  const match = details.match(FAVORITE_LINE);
  const named = match && [home, away].find((t) => t?.abbreviation === match[1]);
  if (match && named) return { ...pickem, favoriteTeamId: named.id, favorite: named.abbreviation, spread: Number(match[2]) };

  // Otherwise use the favorite flags and the size of the spread.
  if (typeof line.spread !== "number") return null;
  if (line.spread === 0) return pickem;
  const favorite = line.homeTeamOdds?.favorite ? home : line.awayTeamOdds?.favorite ? away : null;
  if (!favorite) return null;
  return { ...pickem, favoriteTeamId: favorite.id, favorite: favorite.abbreviation, spread: -Math.abs(line.spread) };
}
