// Dev-only controls for replay mode. Loaded by main.tsx behind import.meta.env.DEV.
import { useEffect, useState } from "react";
import type { ReplayClock, ReplayMeta } from "../replaySource.ts";

const SPEEDS = [1, 10, 30, 60];

export function ReplayBar({ clock, meta }: { clock: ReplayClock; meta: ReplayMeta }) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => rerender((n) => n + 1), 500);
    const unsubscribe = clock.subscribe(() => rerender((n) => n + 1));
    return () => {
      clearInterval(id);
      unsubscribe();
    };
  }, [clock]);

  const now = clock.now();
  const minutes = Math.round((now - clock.start) / 60_000);
  const total = Math.round((clock.end - clock.start) / 60_000);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-violet-800 bg-violet-950/95 px-4 py-2 text-sm text-violet-100 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-semibold">Replay</span>
        <span className="text-violet-300">
          {meta.dir} · {new Date(now).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" })} · {minutes}/{total} min
        </span>
        <button type="button" onClick={() => clock.togglePause()} className="rounded-md bg-violet-800 px-2.5 py-1 hover:bg-violet-700">
          {clock.paused ? "Play" : "Pause"}
        </button>
        <div className="flex gap-1" role="group" aria-label="Replay speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={clock.speed === s}
              onClick={() => clock.setSpeed(s)}
              className={`rounded-md px-2 py-1 ${clock.speed === s ? "bg-violet-600 text-white" : "bg-violet-900 hover:bg-violet-800"}`}
            >
              {s}x
            </button>
          ))}
        </div>
        <input
          type="range"
          aria-label="Jump to time in the recording"
          min={clock.start}
          max={clock.end}
          step={60_000}
          value={now}
          onChange={(e) => clock.seek(Number(e.target.value))}
          className="min-w-40 flex-1 accent-violet-400"
        />
      </div>
    </div>
  );
}
