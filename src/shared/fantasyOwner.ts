import type { BigPlay, FantasyMatchup, FantasyTeam } from "./types.ts";

/**
 * Whose fantasy matchup a big play touches. Only starters count. A player counts whether they are the
 * headline or a secondary player (the passer on a TD catch). A D/ST counts when its team gets the
 * turnover or scores a return or defensive TD. If a play touches both teams, "me" wins.
 */
export function fantasyOwnerOf(play: BigPlay, matchup: FantasyMatchup | null): BigPlay["fantasyOwner"] {
  if (!matchup) return null;
  if (involves(play, matchup.me)) return "me";
  if (matchup.opponent && involves(play, matchup.opponent)) return "opponent";
  return "other";
}

export function withFantasyOwners(plays: BigPlay[], matchup: FantasyMatchup | null): BigPlay[] {
  return plays.map((play) => ({ ...play, fantasyOwner: fantasyOwnerOf(play, matchup) }));
}

function involves(play: BigPlay, team: FantasyTeam): boolean {
  const ids = new Set([play.primaryPlayer?.espnId, ...play.secondaryPlayers.map((p) => p.espnId)]);
  return team.starters.some((slot) =>
    slot.slot === "D/ST" ? play.defenseTeamId === slot.proTeamId : ids.has(slot.espnId),
  );
}
