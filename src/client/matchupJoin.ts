// Joins the fantasy roster with the NFL scoreboard: which game each player is in, and its status.
import type { FantasyTeam, Game, Scoreboard } from "../shared/types.ts";

export interface PlayerGameStatus {
  kind: "pre" | "in" | "post" | "bye" | "none";
  label: string;
  game: Game | null;
}

export function gameForTeam(board: Scoreboard | null, proTeamId: string): Game | null {
  return board?.games.find((g) => g.home.id === proTeamId || g.away.id === proTeamId) ?? null;
}

export function playerGameStatus(board: Scoreboard | null, proTeamId: string): PlayerGameStatus {
  if (!board || proTeamId === "0") return { kind: "none", label: "", game: null };
  const game = gameForTeam(board, proTeamId);
  if (!game) return board.byeTeamIds.includes(proTeamId) ? { kind: "bye", label: "Bye", game: null } : { kind: "none", label: "", game: null };
  const opponent = game.home.id === proTeamId ? `vs ${game.away.abbreviation}` : `@ ${game.home.abbreviation}`;
  if (game.state === "pre") return { kind: "pre", label: `${opponent} · ${kickoffLabel(game.startTime)}`, game };
  if (game.state === "in") return { kind: "in", label: `${opponent} · ${game.detail}`, game };
  return { kind: "post", label: `${opponent} · ${game.detail}`, game };
}

export function startersInGame(game: Game, team: FantasyTeam | null | undefined): number {
  if (!team) return 0;
  return team.starters.filter((s) => s.proTeamId === game.home.id || s.proTeamId === game.away.id).length;
}

export function kickoffLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: "short" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

/** Live games first, then upcoming, then final; by kickoff within each. */
export function orderGames(games: Game[]): Game[] {
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return [...games].sort((a, b) => rank[a.state] - rank[b.state] || a.startTime.localeCompare(b.startTime));
}
