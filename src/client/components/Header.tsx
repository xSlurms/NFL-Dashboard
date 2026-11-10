import { useEffect, useState } from "react";
import type { DashboardState } from "../useDashboard.ts";

function useTick(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)} min ago`);

export function Header({ state, onOpenSettings }: { state: DashboardState; onOpenSettings: () => void }) {
  const now = useTick(1000);
  const live = state.board?.games.filter((g) => g.state === "in").length ?? 0;
  const failing = state.errors.scoreboard && state.errors.fantasy;

  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-lg font-bold tracking-tight">Football Tracker</h1>
        {state.board && <span className="text-sm text-zinc-400">Week {state.board.week}</span>}
        {live > 0 && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
            {live} live
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={`hidden text-xs sm:inline ${failing ? "text-red-400" : "text-zinc-500"}`} aria-live="polite">
          {failing ? "Can't reach ESPN, retrying" : state.updatedAt ? `Updated ${ago(now - state.updatedAt)}` : "Loading…"}
        </span>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
