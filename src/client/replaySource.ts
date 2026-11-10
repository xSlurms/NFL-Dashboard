// Replay mode (dev builds only): plays a recording through the page on its own clock.
// main.tsx imports this only behind `import.meta.env.DEV`, so production builds drop it.
import { getApi, rulesQuery, type ClientSource } from "./api.ts";

export interface ReplayMeta {
  dir: string;
  gameId: string;
  start: string;
  end: string;
}

export class ReplayClock {
  readonly start: number;
  readonly end: number;
  speed = 10;
  paused = false;
  /** Bumped on every seek; the dashboard remounts so a jump doesn't fire a burst of alerts. */
  epoch = 0;
  private anchorReal = Date.now();
  private anchorVirtual: number;
  private listeners = new Set<() => void>();

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
    this.anchorVirtual = start;
  }

  now(): number {
    if (this.paused) return this.anchorVirtual;
    return Math.min(this.end, this.anchorVirtual + (Date.now() - this.anchorReal) * this.speed);
  }

  setSpeed(speed: number) {
    this.reanchor();
    this.speed = speed;
    this.emit();
  }

  togglePause() {
    this.reanchor();
    this.paused = !this.paused;
    this.emit();
  }

  seek(t: number) {
    this.anchorVirtual = Math.max(this.start, Math.min(this.end, t));
    this.anchorReal = Date.now();
    this.epoch++;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private reanchor() {
    this.anchorVirtual = this.now();
    this.anchorReal = Date.now();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export async function createReplay(dir: string, team: string | null): Promise<{ source: ClientSource; clock: ReplayClock; meta: ReplayMeta }> {
  const teamParam = team && /^\d{1,3}$/.test(team) ? `&team=${team}` : "";
  const q = (path: string, extra = "") => `/__replay/${path}?dir=${encodeURIComponent(dir)}&t=${Math.round(clock.now())}${extra}`;
  const meta = await getApi<ReplayMeta>(`/__replay/meta?dir=${encodeURIComponent(dir)}`);
  const clock = new ReplayClock(Date.parse(meta.start), Date.parse(meta.end));
  const source: ClientSource = {
    scoreboard: () => getApi(q("scoreboard")),
    plays: (gameIds, rules) => getApi(q("plays", `&events=${gameIds.join(",")}&${rulesQuery(rules)}`)),
    fantasy: () => getApi(q("fantasy", teamParam)),
    odds: () => getApi(q("odds")),
    persistOdds: false,
    now: () => clock.now(),
    pollOverrideMs: 2_000,
  };
  return { source, clock, meta };
}
