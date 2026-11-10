import { useMemo, useState } from "react";
import { fantasyOwnerOf } from "../../shared/fantasyOwner.ts";
import type { BigPlay, FantasyMatchup, Scoreboard } from "../../shared/types.ts";
import { sortedItems, type PlayStore } from "../playStore.ts";
import type { TickerFilter } from "../settings.ts";
import { Panel, TagChip, playTime } from "./ui.tsx";

const MAX_ITEMS = 120;

const FILTERS: { value: TickerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "matchup", label: "My matchup" },
  { value: "mine", label: "My team" },
];

const OWNER_BORDER = { me: "border-mine", opponent: "border-theirs", other: "border-zinc-800", none: "border-zinc-800" } as const;

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

  const items = useMemo(() => {
    const all = sortedItems(store).map((item) => ({ ...item, owner: fantasyOwnerOf(item.play, fantasy) ?? ("none" as const) }));
    const shown = all.filter((i) => filter === "all" || (filter === "mine" ? i.owner === "me" : i.owner === "me" || i.owner === "opponent"));
    return shown.slice(0, MAX_ITEMS);
  }, [store, fantasy, filter]);

  const selected = items.find((i) => i.play.id === selectedId) ?? null;
  const gameName = (play: BigPlay) => {
    const game = board?.games.find((g) => g.id === play.gameId);
    return game ? `${game.away.abbreviation} @ ${game.home.abbreviation}` : "";
  };

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
        <ol className="-mx-1 flex max-h-[45vh] flex-col gap-2 overflow-y-auto px-1 pb-1 md:max-h-none md:flex-row md:overflow-x-auto md:overflow-y-visible">
          {items.map(({ play, owner }) => (
            <li key={play.id} className="md:w-72 md:shrink-0">
              <button
                type="button"
                aria-expanded={selectedId === play.id}
                onClick={() => setSelectedId(selectedId === play.id ? null : play.id)}
                className={`h-full w-full rounded-lg border-2 bg-zinc-900 px-3 py-2 text-left transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-amber-400 ${OWNER_BORDER[owner]} ${selectedId === play.id ? "ring-1 ring-zinc-400" : ""}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1">
                  {play.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                  {play.status === "overturned" && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-900">OVERTURNED</span>}
                  {owner === "me" && <span className="ml-auto text-[11px] font-semibold text-mine">YOURS</span>}
                  {owner === "opponent" && <span className="ml-auto text-[11px] font-semibold text-theirs">OPPONENT</span>}
                </div>
                <p className={`text-sm leading-snug ${play.status === "overturned" ? "text-zinc-500 line-through" : ""}`}>
                  {play.primaryPlayer && (
                    <>
                      <span className="font-semibold">{play.primaryPlayer.name}</span>
                      <span className="text-zinc-400">, {play.primaryPlayer.position}, {play.primaryPlayer.team}: </span>
                    </>
                  )}
                  {play.description}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {playTime(play)} · {gameName(play)}
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm" aria-live="polite">
          <p className="leading-relaxed text-zinc-200">{selected.play.rawText}</p>
          <p className="mt-2 text-xs text-zinc-400">
            {scoreThen(selected.play, board)} · {playTime(selected.play)}
            {selected.play.status === "overturned" && " · overturned on review or by penalty"}
          </p>
        </div>
      )}

      {error.length > 0 && <p className="mt-2 text-xs text-amber-400">Some games didn't load: {error.join("; ")}</p>}
    </Panel>
  );
}

function scoreThen(play: BigPlay, board: Scoreboard | null): string {
  const game = board?.games.find((g) => g.id === play.gameId);
  if (!game) return `Score then: ${play.scoreAfter.away}-${play.scoreAfter.home}`;
  return `Score then: ${game.away.abbreviation} ${play.scoreAfter.away}, ${game.home.abbreviation} ${play.scoreAfter.home}`;
}
