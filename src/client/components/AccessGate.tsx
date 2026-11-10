import { useState } from "react";

/** Shown when the server rejects the stored key (or there is none yet). */
export function AccessGate({ hadKey, onSubmit }: { hadKey: boolean; onSubmit: (key: string) => void }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <h1 className="text-lg font-bold">Football Tracker</h1>
        <p className="mt-1 text-sm text-zinc-400">This page is private. Enter the access key once and this browser will remember it.</p>
        {hadKey && (
          <p role="alert" className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-200">
            That key didn't work. It may have been changed.
          </p>
        )}
        {/* The hidden username lets password managers save and fill the key. */}
        <input type="text" name="username" autoComplete="username" value="football-tracker" readOnly hidden />
        <label className="mt-4 block text-sm">
          Access key
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 focus-visible:outline-2 focus-visible:outline-amber-400"
          />
        </label>
        <button
          type="submit"
          disabled={!trimmed}
          className="mt-4 w-full rounded-md bg-amber-400 px-3 py-2 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
        >
          Open
        </button>
      </form>
    </main>
  );
}
