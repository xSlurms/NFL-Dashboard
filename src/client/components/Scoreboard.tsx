import type { FantasyMatchup, Game, GameTeam, Scoreboard } from "../../shared/types.ts";
import type { ApiFetchError } from "../api.ts";
import { kickoffLabel, orderGames, startersInGame } from "../matchupJoin.ts";
import { Panel, TeamLogo } from "./ui.tsx";

interface Props {
  board: Scoreboard | null;
  fantasy: FantasyMatchup | null;
  possession: Record<string, string>;
  error: ApiFetchError | null;
}

export function ScoreboardPanel({ board, fantasy, possession, error }: Props) {
  return (
    <Panel title={board ? `Scores · Week ${board.week}` : "Scores"}>
      {error && <p className="mb-2 text-xs text-amber-400">{board ? "Showing the last scores we got. " : ""}{error.message}</p>}
      {!board && !error && <p className="py-6 text-center text-sm text-zinc-500">Loading scores…</p>}
      {board && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {orderGames(board.games).map((game) => (
            <li key={game.id}>
              <GameCard
                game={game}
                possessionTeamId={game.possessionTeamId ?? possession[game.id] ?? null}
                mine={startersInGame(game, fantasy?.me)}
                theirs={startersInGame(game, fantasy?.opponent)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GameCard({ game, possessionTeamId, mine, theirs }: { game: Game; possessionTeamId: string | null; mine: number; theirs: number }) {
  const live = game.state === "in";
  const status = game.state === "pre" ? kickoffLabel(game.startTime) : game.detail;
  return (
    <article className={`rounded-lg border bg-zinc-900 px-3 py-2 ${live ? "border-emerald-700/70" : "border-zinc-800"}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs">
        <span className={live ? "font-semibold text-emerald-400" : "text-zinc-400"}>{status}</span>
        {live && game.isRedZone && <span className="rounded bg-red-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white">RED ZONE</span>}
        <span className="ml-auto flex gap-1">
          {mine > 0 && (
            <span className="rounded border border-mine/60 px-1.5 py-0.5 text-[10px] font-semibold text-mine" title={`${mine} of your starters`}>
              {mine} yours
            </span>
          )}
          {theirs > 0 && (
            <span className="rounded border border-theirs/50 px-1.5 py-0.5 text-[10px] font-semibold text-theirs" title={`${theirs} of your opponent's starters`}>
              {theirs} opp
            </span>
          )}
        </span>
      </div>
      <TeamRow team={game.away} game={game} hasBall={live && possessionTeamId === game.away.id} />
      <TeamRow team={game.home} game={game} hasBall={live && possessionTeamId === game.home.id} />
      {live && (game.downDistance || game.lastPlay) && (
        <p className="mt-1.5 truncate text-xs text-zinc-400" title={game.lastPlay ?? undefined}>
          {game.downDistance ?? game.lastPlay}
        </p>
      )}
    </article>
  );
}

function TeamRow({ team, game, hasBall }: { team: GameTeam; game: Game; hasBall: boolean }) {
  const other = team.id === game.home.id ? game.away : game.home;
  const lost = game.state === "post" && team.score < other.score;
  return (
    <div className={`flex items-center gap-2 py-0.5 ${lost ? "text-zinc-500" : ""}`}>
      <TeamLogo src={team.logo} alt="" />
      <span className="font-semibold">{team.abbreviation}</span>
      {team.record && <span className="text-xs text-zinc-500">{team.record}</span>}
      {hasBall && (
        <span className="text-amber-500" role="img" aria-label="has the ball" title="Has the ball">
          ●
        </span>
      )}
      <span className="ml-auto text-lg font-bold tabular-nums">{game.state === "pre" ? "" : team.score}</span>
    </div>
  );
}
