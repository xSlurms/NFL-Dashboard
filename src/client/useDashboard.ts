// The polling loop: fantasy, then the scoreboard for the same week, then big plays for the games that need them.
import { useEffect, useRef, useState } from "react";
import { fantasyOwnerOf } from "../shared/fantasyOwner.ts";
import type { BigPlay, FantasyMatchup, Scoreboard } from "../shared/types.ts";
import { ApiFetchError, type ClientSource } from "./api.ts";
import { emptyStore, mergePlays, type PlayStore } from "./playStore.ts";
import { IDLE_POLL_MS, backgroundDelay, emptyWatch, gamesToFetch, markFetched, matchupIsLive, pollDelay, rememberPossession } from "./schedule.ts";
import { activeTeamOf, type Settings } from "./settings.ts";

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
  // Read when scheduling, so turning notifications on or off doesn't restart the loop.
  const backgroundAlertsRef = useRef(false);
  backgroundAlertsRef.current = settings.notifications || settings.sound;
  const team = activeTeamOf(settings);
  const rulesKey = JSON.stringify(settings.rules);
  const teamKey = JSON.stringify(team);

  // Kept across restarts of the loop, so switching tabs doesn't reload the scores or the ticker.
  const memory = useRef({ state: initialState(), store: emptyStore(), watch: emptyWatch(), rulesKey, teamKey, fantasyAt: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const m = memory.current;
    // New rules mean a new set of big plays: start over, and don't alert on the reseed.
    if (m.rulesKey !== rulesKey) {
      m.store = emptyStore();
      m.watch = emptyWatch();
      m.rulesKey = rulesKey;
    }
    // A different team: drop the old matchup so it isn't shown under the new tab.
    let current: DashboardState = { ...m.state, store: m.store };
    if (m.teamKey !== teamKey) {
      current = { ...current, fantasy: null, errors: { ...current.errors, fantasy: null } };
      m.teamKey = teamKey;
    }
    let store = m.store;
    let watch = m.watch;
    const rules = settings.rules;
    setState(current);

    const cycle = async () => {
      const now = source.now();
      const next: DashboardState = { ...current, errors: { scoreboard: null, fantasy: null, plays: [] } };

      // Fantasy: nothing to ask for without a team. With one, poll at the live rate only while one of the
      // matchup's games can change the points; otherwise every few minutes.
      const fantasyDue =
        !current.fantasy ||
        matchupIsLive(current.board?.games ?? [], current.fantasy, watch, now) ||
        Date.now() - m.fantasyAt >= IDLE_POLL_MS;
      if (!team && !source.servesDefaultTeam) {
        next.fantasy = null;
        next.errors.fantasy = new ApiFetchError(0, "no_team", "No team chosen yet.");
      } else if (fantasyDue) {
        try {
          next.fantasy = await source.fantasy(team);
          m.fantasyAt = Date.now();
        } catch (error) {
          next.errors.fantasy = asApiError(error);
          // Don't keep showing the old team's matchup when the problem is the team itself.
          if (["no_team", "bad_request"].includes(next.errors.fantasy.code)) next.fantasy = null;
        }
      } else {
        next.errors.fantasy = current.errors.fantasy;
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

      visibleDelay = source.pollOverrideMs ?? pollDelay(games, watch, now, settings.pollSeconds * 1000);
      current = { ...next, store, updatedAt: Date.now(), nextPollAt: Date.now() + visibleDelay };
      Object.assign(m, { state: current, store, watch });
      setState(current);
      if (alerts.length) alertsRef.current(alerts);
    };

    // A hidden tab refreshes once a minute if it has alerts to deliver, otherwise not at all; showing
    // the tab again refreshes at once and goes back to the normal rate.
    let running = false;
    let paused = false;
    let nextAt = 0;
    let visibleDelay = 0;
    const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

    const schedule = () => {
      clearTimeout(timer);
      const wait = backgroundDelay(visibleDelay, isHidden(), backgroundAlertsRef.current);
      paused = wait === null;
      if (wait === null) return;
      nextAt = Date.now() + wait;
      timer = setTimeout(run, wait);
    };

    const run = async () => {
      if (running) return;
      running = true;
      try {
        await cycle();
      } finally {
        running = false;
      }
      if (!cancelled) schedule();
    };

    const onVisibility = () => {
      if (isHidden() || running) return;
      if (paused || nextAt - Date.now() > visibleDelay) void run();
    };

    void run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // The keys stand in for settings.rules and the active team, so saving the same values doesn't restart the loop.
  }, [source, rulesKey, teamKey, settings.pollSeconds]);

  return state;
}
