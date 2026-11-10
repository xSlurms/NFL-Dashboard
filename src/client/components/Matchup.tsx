import { useEffect, useRef, useState } from "react";
import type { FantasyMatchup, FantasyTeam, RosterSlot, Scoreboard } from "../../shared/types.ts";
import type { ApiFetchError } from "../api.ts";
import { playerGameStatus } from "../matchupJoin.ts";
import { Panel, TeamLogo, fmtPoints } from "./ui.tsx";

interface Props {
  fantasy: FantasyMatchup | null;
  board: Scoreboard | null;
  error: ApiFetchError | null;
}

export function Matchup({ fantasy, board, error }: Props) {
  if (!fantasy) {
    return (
      <Panel title="My matchup">
        {error ? <FantasyError error={error} /> : <p className="py-6 text-center text-sm text-zinc-500">Loading matchup…</p>}
      </Panel>
    );
  }
  const { me, opponent } = fantasy;
  const rows = Math.max(me.starters.length, opponent?.starters.length ?? 0);

  return (
    <Panel title={`My matchup · Week ${fantasy.week}`}>
      {error && <FantasyError error={error} stale />}
      <Totals me={me} opponent={opponent} />

      {opponent === null && <p className="mb-3 text-sm text-zinc-400">No opponent this week.</p>}

      <div role="table" aria-label="Starters" className="text-sm">
        {Array.from({ length: rows }, (_, i) => (
          <HeadToHead key={i} mine={me.starters[i]} theirs={opponent?.starters[i]} board={board} />
        ))}
      </div>

      <details className="mt-3 rounded-lg border border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400 select-none hover:text-zinc-200">Bench</summary>
        <div className="border-t border-zinc-800 p-2 text-sm">
          {Array.from({ length: Math.max(me.bench.length, opponent?.bench.length ?? 0) }, (_, i) => (
            <HeadToHead key={i} mine={me.bench[i]} theirs={opponent?.bench[i]} board={board} />
          ))}
        </div>
      </details>
    </Panel>
  );
}

function Totals({ me, opponent }: { me: FantasyTeam; opponent: FantasyTeam | null }) {
  const myChance = me.winProbability;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamHeading team={me} align="left" color="text-mine" />
        <span className="text-xs text-zinc-500">vs</span>
        {opponent ? <TeamHeading team={opponent} align="right" color="text-theirs" /> : <span />}
      </div>
      {myChance !== null && opponent && (
        <div className="mt-2">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-theirs/70" aria-hidden>
            <div className="bg-mine" style={{ width: `${Math.round(myChance * 100)}%` }} />
          </div>
          <p className="mt-1 text-center text-xs text-zinc-400">ESPN win chance: {Math.round(myChance * 100)}%</p>
        </div>
      )}
    </div>
  );
}

function TeamHeading({ team, align, color }: { team: FantasyTeam; align: "left" | "right"; color: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo src={team.logo} alt="" size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-300">{team.name}</p>
        <p className={`text-3xl leading-tight font-bold tabular-nums ${color}`}>
          <Points value={team.totalPoints} />
        </p>
        {team.projectedPoints !== null && <p className="text-xs text-zinc-500">Proj {fmtPoints(team.projectedPoints)}</p>}
      </div>
    </div>
  );
}

function HeadToHead({ mine, theirs, board }: { mine?: RosterSlot; theirs?: RosterSlot; board: Scoreboard | null }) {
  const slot = mine?.slot ?? theirs?.slot ?? "";
  return (
    <div role="row" className="grid grid-cols-[minmax(0,1fr)_3rem_2.75rem_3rem_minmax(0,1fr)] items-center gap-1 border-b border-zinc-800/70 py-1.5 last:border-0">
      <PlayerCell player={mine} board={board} align="left" />
      <span role="cell" className="text-right font-semibold tabular-nums">
        {mine && <Points value={mine.points} />}
      </span>
      <span role="cell" className="text-center text-[11px] font-semibold text-zinc-500">
        {slot}
      </span>
      <span role="cell" className="text-left font-semibold tabular-nums">
        {theirs && <Points value={theirs.points} />}
      </span>
      <PlayerCell player={theirs} board={board} align="right" />
    </div>
  );
}

const STATUS_COLOR = { pre: "text-zinc-500", in: "text-emerald-400", post: "text-zinc-500", bye: "text-amber-500", none: "text-zinc-600" } as const;

function PlayerCell({ player, board, align }: { player?: RosterSlot; board: Scoreboard | null; align: "left" | "right" }) {
  if (!player) return <span role="cell" />;
  const status = playerGameStatus(board, player.proTeamId);
  return (
    <div role="cell" className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <p className="truncate font-medium">{player.name}</p>
      <p className="truncate text-xs">
        <span className="text-zinc-400">
          {player.position} · {player.proTeam}
        </span>
        {status.label && <span className={STATUS_COLOR[status.kind]}> · {status.label}</span>}
      </p>
    </div>
  );
}

/** Flashes green or red for a moment when the value changes. */
function Points({ value }: { value: number }) {
  const previous = useRef(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  useEffect(() => {
    if (value !== previous.current) {
      setFlash((f) => ({ dir: value > previous.current ? "up" : "down", n: (f?.n ?? 0) + 1 }));
      previous.current = value;
    }
  }, [value]);
  return (
    <span key={flash?.n} className={`rounded px-0.5 ${flash ? (flash.dir === "up" ? "animate-flash-up" : "animate-flash-down") : ""}`}>
      {fmtPoints(value)}
    </span>
  );
}

function FantasyError({ error, stale = false }: { error: ApiFetchError; stale?: boolean }) {
  const message =
    error.code === "espn_auth"
      ? "ESPN refused the fantasy request. Refresh the ESPN cookies (ESPN_S2 and ESPN_SWID) in the environment settings."
      : error.code === "config"
        ? error.message
        : `Couldn't load the fantasy matchup: ${error.message}`;
  return <p className={`mb-3 rounded-md px-3 py-2 text-sm ${error.code === "espn_auth" ? "bg-red-950 text-red-200" : "bg-amber-950/60 text-amber-200"}`}>{stale ? `${message} Showing the last data we got.` : message}</p>;
}
