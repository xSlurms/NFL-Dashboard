// Tracks every big play the page has shown and diffs each /api/plays response against it.
import type { BigPlay, PlaysResponse } from "../shared/types.ts";

export interface TickerItem {
  play: BigPlay;
  firstSeenAt: number;
}

export interface PlayStore {
  items: ReadonlyMap<string, TickerItem>;
  /** Games fetched at least once. Plays found on a game's first fetch already happened: no alerts. */
  fetchedGames: ReadonlySet<string>;
}

export interface MergeResult {
  store: PlayStore;
  /** New active plays worth an alert. */
  added: BigPlay[];
  /** Plays that were active and now aren't. */
  overturned: BigPlay[];
}

export const emptyStore = (): PlayStore => ({ items: new Map(), fetchedGames: new Set() });

export function mergePlays(store: PlayStore, response: PlaysResponse, now: number): MergeResult {
  const items = new Map(store.items);
  const fetchedGames = new Set(store.fetchedGames);
  const added: BigPlay[] = [];
  const overturned: BigPlay[] = [];

  for (const game of response.games) {
    const firstFetch = !fetchedGames.has(game.gameId);
    fetchedGames.add(game.gameId);
    const present = new Set<string>();

    for (const play of game.plays) {
      present.add(play.id);
      const known = items.get(play.id);
      if (!known) {
        items.set(play.id, { play, firstSeenAt: now });
        if (!firstFetch && play.status === "active") added.push(play);
      } else {
        if (known.play.status === "active" && play.status === "overturned") overturned.push(play);
        items.set(play.id, { ...known, play });
      }
    }

    // A play ESPN dropped entirely (rare) is shown as overturned rather than silently removed.
    for (const [id, item] of items) {
      if (item.play.gameId !== game.gameId || present.has(id) || item.play.status === "overturned") continue;
      const play: BigPlay = { ...item.play, status: "overturned" };
      items.set(id, { ...item, play });
      overturned.push(play);
    }
  }
  return { store: { items, fetchedGames }, added, overturned };
}

/** Newest first, by when the play happened; plays without a time fall back to when the page saw them. */
export function sortedItems(store: PlayStore): TickerItem[] {
  const time = (item: TickerItem) => (item.play.wallclock ? Date.parse(item.play.wallclock) : item.firstSeenAt);
  return [...store.items.values()].sort((a, b) => time(b) - time(a) || b.play.id.localeCompare(a.play.id));
}
