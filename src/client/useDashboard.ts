// The polling loop: fantasy, then the scoreboard for the same week, then big plays for the games that need them.
import { useEffect, useRef, useState } from "react";
import { fantasyOwnerOf } from "../shared/fantasyOwner.ts";
import type { BigPlay, FantasyMatchup, Scoreboard } from "../shared/types.ts";
import { ApiFetchError, type ClientSource } from "./api.ts";
import { emptyStore, mergePlays, type PlayStore } from "./playStore.ts";
import { emptyWatch, gamesToFetch, markFetched, pollDelay, rememberPossession } from "./schedule.ts";
import type { Settings } from "./settings.ts";

export interface Alert {
  kind: "big-play" | "overturned";
  owner: "me" | "opponent";
  play: BigPlay;
}

export interface DashboardState {
  board: Scoreboard | null;
  fantasy: FantasyMatchup | null;
  store: PlayStore;
  possession: Record<string, string>;
  errors: { scoreboard: ApiFetchError | null; fantasy: ApiFetchError | null; plays: string[] };
  updatedAt: number | null;
  nextPollAt: number | null;
}

const initialState = (): DashboardState => ({
  board: null,
  fantasy: null,
  store: emptyStore(),
  possession: {},
  errors: { scoreboard: null, fantasy: null, plays: [] },
  updatedAt: null,
  nextPollAt: null,
});

const asApiError = (error: unknown) =>
  error instanceof ApiFetchError ? error : new ApiFetchError(0, "upstream", (error as Error)?.message ?? "Unknown error");

export function useDashboard(source: ClientSource, settings: Settings, onAlerts: (alerts: Alert[]) => void): DashboardState {
  const [state, setState] = useState(initialState);
  const alertsRef = useRef(onAlerts);
  alertsRef.current = onAlerts;
  const rulesKey = JSON.stringify(settings.rules);

  useEffect(() => {
    // New rules mean a new set of big plays: start over, and don't alert on the reseed.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let store = emptyStore();
    let watch = emptyWatch();
    let current = initialState();
    const rules = settings.rules;
    setState(current);

    const cycle = async () => {
      const now = source.now();
      const next: DashboardState = { ...current, errors: { scoreboard: null, fantasy: null, plays: [] } };

      try {
        next.fantasy = await source.fantasy();
      } catch (error) {
        next.errors.fantasy = asApiError(error);
      }
      if (cancelled) return;

      try {
        next.board = await source.scoreboard(next.fantasy?.week);
        next.possession = rememberPossession(current.possession, next.board.games);
      } catch (error) {
        next.errors.scoreboard = asApiError(error);
      }
      if (cancelled) return;

      const games = next.board?.games ?? [];
      const plan = gamesToFetch(games, watch, now);
      watch = plan.watch;
      const alerts: Alert[] = [];
      if (plan.ids.length > 0) {
        try {
          const response = await source.plays(plan.ids, rules);
          if (cancelled) return;
          watch = markFetched(watch, games, response);
          const merged = mergePlays(store, response, now);
          store = merged.store;
          next.errors.plays = response.errors.map((e) => `${e.gameId}: ${e.message}`);
          for (const [kind, plays] of [["big-play", merged.added], ["overturned", merged.overturned]] as const) {
            for (const play of plays) {
              const owner = fantasyOwnerOf(play, next.fantasy);
              if (owner === "me" || owner === "opponent") alerts.push({ kind, owner, play });
            }
          }
        } catch (error) {
          next.errors.plays = [asApiError(error).message];
        }
      }
      if (cancelled) return;

      const delay = source.pollOverrideMs ?? pollDelay(games, watch, now, settings.pollSeconds * 1000);
      current = { ...next, store, updatedAt: Date.now(), nextPollAt: Date.now() + delay };
      setState(current);
      if (alerts.length) alertsRef.current(alerts);
      timer = setTimeout(cycle, delay);
    };

    cycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // rulesKey stands in for settings.rules, so editing the same values doesn't restart the loop.
  }, [source, rulesKey, settings.pollSeconds]);

  return state;
}
