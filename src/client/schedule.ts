// Which games to ask /api/plays about, and how long to wait between polls.
import type { Game, GameState, PlaysResponse } from "../shared/types.ts";

/** Keep polling a game this long after it goes final, to catch late corrections and reviews. */
export const FINAL_SWEEP_MS = 10 * 60_000;
export const IDLE_POLL_MS = 5 * 60_000;
const KICKOFF_SOON_MS = 10 * 60_000;

export interface GameWatch {
  lastState: ReadonlyMap<string, GameState>;
  sweepUntil: ReadonlyMap<string, number>;
  /** Final games whose plays were fetched once; they won't change again. */
  doneFinal: ReadonlySet<string>;
}

export const emptyWatch = (): GameWatch => ({ lastState: new Map(), sweepUntil: new Map(), doneFinal: new Set() });

/**
 * Live games every poll. A game seen going final keeps being polled for FINAL_SWEEP_MS.
 * A game that was already final when the page loaded is fetched once, to fill the ticker.
 */
export function gamesToFetch(games: Game[], watch: GameWatch, now: number): { ids: string[]; watch: GameWatch } {
  const lastState = new Map(watch.lastState);
  const sweepUntil = new Map(watch.sweepUntil);
  const ids: string[] = [];
  for (const game of games) {
    const before = lastState.get(game.id);
    lastState.set(game.id, game.state);
    if (game.state === "in") {
      ids.push(game.id);
    } else if (game.state === "post") {
      if (before === "in") sweepUntil.set(game.id, now + FINAL_SWEEP_MS);
      const sweeping = (sweepUntil.get(game.id) ?? 0) > now;
      if (sweeping || !watch.doneFinal.has(game.id)) ids.push(game.id);
    }
  }
  return { ids, watch: { ...watch, lastState, sweepUntil } };
}

/** Records final games whose plays arrived, so they aren't fetched again once their sweep ends. */
export function markFetched(watch: GameWatch, games: Game[], response: PlaysResponse): GameWatch {
  const doneFinal = new Set(watch.doneFinal);
  const final = new Set(games.filter((g) => g.state === "post").map((g) => g.id));
  for (const game of response.games) if (final.has(game.gameId)) doneFinal.add(game.gameId);
  return { ...watch, doneFinal };
}

/** Fast while anything is live, about to kick off, or in its final sweep; every 5 minutes otherwise. */
export function pollDelay(games: Game[], watch: GameWatch, now: number, liveMs: number): number {
  const busy = games.some(
    (g) =>
      g.state === "in" ||
      (g.state === "pre" && Date.parse(g.startTime) - now < KICKOFF_SOON_MS) ||
      (watch.sweepUntil.get(g.id) ?? 0) > now,
  );
  return busy ? liveMs : IDLE_POLL_MS;
}

/** ESPN drops possession between plays; keep the last team that had the ball while the game is live. */
export function rememberPossession(previous: Readonly<Record<string, string>>, games: Game[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const game of games) {
    if (game.state !== "in") continue;
    const team = game.possessionTeamId ?? previous[game.id];
    if (team) next[game.id] = team;
  }
  return next;
}
