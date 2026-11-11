import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import { fantasyOwnerOf } from "../../shared/fantasyOwner.ts";
import type { BigPlay, FantasyMatchup, Game, Scoreboard } from "../../shared/types.ts";
import { playTone, rowTags, scoreAfterLabel, shortName, type PlayTone } from "../playRow.ts";
import { sortedItems, type PlayStore } from "../playStore.ts";
import type { TickerFilter } from "../settings.ts";
import { Panel, TAG_LABELS, playTime } from "./ui.tsx";

const MAX_ITEMS = 120;

const FILTERS: { value: TickerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "matchup", label: "My matchup" },
  { value: "mine", label: "My team" },
];

// The whole row is tinted by what happened; its tags use a stronger shade of the same color.
const TONES: Record<PlayTone, { row: string; chip: string }> = {
  turnoverTd: { row: "bg-rose-500/35", chip: "bg-rose-500/55 text-rose-50" },
  td: { row: "bg-emerald-500/15", chip: "bg-emerald-500/30 text-emerald-200" },
  turnover: { row: "bg-rose-500/18", chip: "bg-rose-500/35 text-rose-200" },
  long: { row: "bg-sky-500/14", chip: "bg-sky-500/30 text-sky-200" },
  fg: { row: "bg-violet-400/15", chip: "bg-violet-400/30 text-violet-100" },
  fumbleKept: { row: "bg-yellow-500/12", chip: "bg-yellow-500/30 text-yellow-100" },
  miss: { row: "bg-zinc-500/15", chip: "bg-zinc-500/35 text-zinc-200" },
  overturned: { row: "bg-zinc-700/25 text-zinc-500", chip: "bg-zinc-600/40 text-zinc-400 line-through" },
};

// Whose player it was shows as the row's left edge and a label at the end, so the fill stays about the play.
const OWNER = {
  me: { edge: "border-l-mine", label: "YOU", text: "text-mine" },
  opponent: { edge: "border-l-theirs", label: "OPP", text: "text-theirs" },
  other: { edge: "border-l-transparent", label: "", text: "" },
  none: { edge: "border-l-transparent", label: "", text: "" },
} as const;

const CELL = "px-1.5 py-1.5 truncate sm:px-2";

// Columns shown at each width (Tailwind's sm, md and lg). The details row spans exactly these: spanning
// columns that are hidden would add empty ones and squeeze the rest.
const WIDE = ["(min-width: 40rem)", "(min-width: 48rem)", "(min-width: 48rem)", "(min-width: 64rem)"];
const subscribe = (onChange: () => void) => {
  const lists = WIDE.map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
};
const visibleColumns = () => 4 + WIDE.filter((q) => window.matchMedia(q).matches).length;

interface Props {
  store: PlayStore;
  board: Scoreboard | null;
  fantasy: FantasyMatchup | null;
  filter: TickerFilter;
  onFilter: (filter: TickerFilter) => void;
  error: string[];
}

export function Ticker({ store, board, fantasy, filter, onFilter, error }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const columns = useSyncExternalStore(subscribe, visibleColumns);

  const items = useMemo(() => {
    const all = sortedItems(store).map((item) => ({ ...item, owner: fantasyOwnerOf(item.play, fantasy) ?? ("none" as const) }));
    const shown = all.filter((i) => filter === "all" || (filter === "mine" ? i.owner === "me" : i.owner === "me" || i.owner === "opponent"));
    return shown.slice(0, MAX_ITEMS);
  }, [store, fantasy, filter]);

  const gameOf = (play: BigPlay) => board?.games.find((g) => g.id === play.gameId);

  return (
    <Panel
      title="Big plays"
      aside={
        <div role="radiogroup" aria-label="Show big plays from" className="flex rounded-lg border border-zinc-700 p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => onFilter(f.value)}
              className={`rounded-md px-2.5 py-1 ${filter === f.value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">
          {filter === "all" ? "No big plays yet. They appear here once games are underway." : "Nothing from your matchup yet."}
        </p>
      ) : (
        <div className="-mx-1 max-h-[22rem] overflow-y-auto px-1">
          <table className="w-full table-fixed border-separate border-spacing-y-[3px] text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900 text-left text-[11px] text-zinc-500">
              <tr>
                <th scope="col" className="w-[4.25rem] px-1.5 py-1 font-medium sm:w-20 sm:px-2">Time</th>
                <th scope="col" className="hidden w-20 px-2 py-1 font-medium md:table-cell">Game</th>
                <th scope="col" className="w-24 px-1.5 py-1 font-medium sm:px-2 md:w-32">Play</th>
                <th scope="col" className="px-1.5 py-1 font-medium sm:w-36 sm:px-2 md:w-44">Player</th>
                <th scope="col" className="hidden px-2 py-1 font-medium sm:table-cell">What happened</th>
                <th scope="col" className="hidden w-12 px-2 py-1 text-right font-medium md:table-cell">Yds</th>
                <th scope="col" className="hidden w-24 px-2 py-1 font-medium lg:table-cell">Score after</th>
                <th scope="col" className="w-10 px-1.5 py-1 font-medium sm:px-2">
                  <span className="sr-only">Fantasy</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ play, owner }) => {
                const tone = TONES[playTone(play)];
                const own = OWNER[owner];
                const game = gameOf(play);
                const open = selectedId === play.id;
                const overturned = play.status === "overturned";
                return (
                  <Fragment key={play.id}>
                    {/* The whole row toggles the details; the button on the player is what keyboards and screen readers use. */}
                    <tr
                      onClick={() => setSelectedId(open ? null : play.id)}
                      className={`cursor-pointer transition-[filter] hover:brightness-125 ${tone.row} ${open ? "outline outline-1 outline-zinc-400" : ""}`}
                    >
                      <td className={`${CELL} border-l-4 tabular-nums ${own.edge}`}>{playTime(play)}</td>
                      <td className={`${CELL} hidden text-zinc-400 md:table-cell`}>{game ? `${game.away.abbreviation} @ ${game.home.abbreviation}` : ""}</td>
                      <td className={CELL}>
                        <span className="flex gap-1">
                          {overturned && <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-bold text-zinc-900">OVERTURNED</span>}
                          {rowTags(play).map((tag) => (
                            <span key={tag} className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide ${tone.chip}`}>
                              {TAG_LABELS[tag]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className={CELL}>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${play.primaryPlayer?.name ?? "Play"}: ${play.description}. Show the full play`}
                          className="max-w-full truncate text-left focus-visible:outline-2 focus-visible:outline-amber-400"
                        >
                          <PlayerCell play={play} game={game} />
                        </button>
                      </td>
                      <td className={`${CELL} hidden sm:table-cell ${overturned ? "line-through" : ""}`}>{play.description}</td>
                      <td className={`${CELL} hidden text-right tabular-nums md:table-cell ${overturned ? "line-through" : ""}`}>{play.yards ?? ""}</td>
                      <td className={`${CELL} hidden text-zinc-400 tabular-nums lg:table-cell`}>{scoreAfterLabel(play, game)}</td>
                      <td className={`${CELL} text-[11px] font-semibold ${own.text}`}>{own.label}</td>
                    </tr>
                    {open && (
                      <tr aria-live="polite">
                        <td colSpan={columns} className="rounded-b border border-t-0 border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                          <p className="leading-relaxed text-zinc-200">{play.rawText}</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {scoreThen(play, game)} · {playTime(play)}
                            {overturned && " · overturned on review or by penalty"}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error.length > 0 && <p className="mt-2 text-xs text-amber-400">Some games didn't load: {error.join("; ")}</p>}
    </Panel>
  );
}

function PlayerCell({ play, game }: { play: BigPlay; game: Game | undefined }) {
  const p = play.primaryPlayer;
  if (p) {
    return (
      <span title={p.name}>
        <span className={`font-semibold ${play.status === "overturned" ? "line-through" : ""}`}>{shortName(p.name)}</span>
        <span className="text-zinc-400">
          {" "}
          {p.position} {p.team}
        </span>
      </span>
    );
  }
  const defense = game && [game.home, game.away].find((t) => t.id === play.defenseTeamId);
  return <span className="font-semibold">{defense ? `${defense.abbreviation} D/ST` : "–"}</span>;
}

function scoreThen(play: BigPlay, game: Game | undefined): string {
  if (!game) return `Score then: ${play.scoreAfter.away}-${play.scoreAfter.home}`;
  return `Score then: ${game.away.abbreviation} ${play.scoreAfter.away}, ${game.home.abbreviation} ${play.scoreAfter.home}`;
}
