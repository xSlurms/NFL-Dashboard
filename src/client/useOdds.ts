// Point spreads, fetched only when the "Update odds" button is pressed and remembered for the week.
import { useCallback, useState } from "react";
import type { GameOdds, OddsResponse } from "../shared/types.ts";
import type { ClientSource } from "./api.ts";

export interface OddsState {
  week: number | null;
  byGame: Readonly<Record<string, GameOdds>>;
  updatedAt: number | null;
}

const EMPTY: OddsState = { week: null, byGame: {}, updatedAt: null };
const KEY = "football-tracker:odds";

/**
 * A new week starts fresh. Within a week, a game with no line in the new response keeps the one it had:
 * ESPN drops lines at kickoff, and the pre-game line is still worth showing.
 */
export function mergeOdds(previous: OddsState, response: OddsResponse, now: number): OddsState {
  const byGame: Record<string, GameOdds> = previous.week === response.week ? { ...previous.byGame } : {};
  for (const game of response.games) byGame[game.gameId] = game;
  return { week: response.week, byGame, updatedAt: now };
}

function load(): OddsState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && typeof parsed.week === "number" && parsed.byGame && typeof parsed.byGame === "object") return parsed;
  } catch {
    // fall through
  }
  return EMPTY;
}

function save(state: OddsState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // this visit only
  }
}

export function useOdds(source: ClientSource) {
  const persist = source.persistOdds !== false;
  const [odds, setOdds] = useState<OddsState>(() => (persist ? load() : EMPTY));
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (week: number | undefined) => {
      setUpdating(true);
      setError(null);
      try {
        const response = await source.odds(week);
        setOdds((previous) => {
          const next = mergeOdds(previous, response, Date.now());
          if (persist) save(next);
          return next;
        });
      } catch (e) {
        setError((e as Error).message || "Couldn't get odds");
      } finally {
        setUpdating(false);
      }
    },
    [source, persist],
  );

  return { odds, updating, error, update };
}
