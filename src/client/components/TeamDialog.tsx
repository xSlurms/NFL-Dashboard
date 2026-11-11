import { useEffect, useId, useRef, useState } from "react";
import type { FantasyMatchup } from "../../shared/types.ts";
import { ApiFetchError } from "../api.ts";
import { parseCookies, parseTeamUrl, teamKey, type SavedTeam } from "../teamUrl.ts";

interface Props {
  /** Editing an existing team, or null to add one. */
  editing: SavedTeam | null;
  /** Fetches the matchup for a candidate team, to check it works before saving. */
  verify: (team: SavedTeam) => Promise<FantasyMatchup>;
  onSave: (team: SavedTeam) => void;
  onClose: () => void;
}

const linkFor = (t: SavedTeam) =>
  `https://fantasy.espn.com/football/team?leagueId=${t.leagueId}&teamId=${t.teamId}${t.season ? `&seasonId=${t.season}` : ""}`;

export function TeamDialog({ editing, verify, onSave, onClose }: Props) {
  const [link, setLink] = useState(editing ? linkFor(editing) : "");
  const [isPrivate, setIsPrivate] = useState(!!editing?.espnS2);
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const keepsCookies = !!editing?.espnS2 && isPrivate;

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    const choice = parseTeamUrl(link);
    if ("error" in choice) return setError(choice.error);

    let cookies: { espnS2: string; swid: string } | null = null;
    if (isPrivate) {
      if (keepsCookies && !s2.trim() && !swid.trim()) {
        cookies = { espnS2: editing!.espnS2!, swid: editing!.swid! };
      } else {
        const parsed = parseCookies(s2, swid);
        if ("error" in parsed) return setError(parsed.error);
        cookies = parsed;
      }
    }

    const team: SavedTeam = { ...choice, key: teamKey(choice), name: null, espnS2: cookies?.espnS2 ?? null, swid: cookies?.swid ?? null };
    setChecking(true);
    try {
      const matchup = await verify(team);
      onSave({ ...team, name: matchup.me.name });
    } catch (e) {
      const code = e instanceof ApiFetchError ? e.code : null;
      setError(
        code === "espn_auth" && !isPrivate
          ? "ESPN says this league is private. Turn on Private league below and add your cookies."
          : (e as Error).message || "Couldn't load that team.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-dialog-title"
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="team-dialog-title" className="text-lg font-semibold">
            {editing ? "Edit team" : "Add a team"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800">
            Cancel
          </button>
        </div>

        <label className="block text-sm">
          ESPN team link
          <input
            ref={firstField}
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://fantasy.espn.com/football/team?leagueId=…&teamId=…"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">Open your team's page on ESPN Fantasy and copy the address from the browser's address bar.</p>

        <label className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span>
            Private league
            <span id="private-hint" className="block text-xs text-zinc-500">
              Public leagues only need the link. Private ones also need two ESPN cookies.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Private league"
            aria-describedby="private-hint"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="size-4 shrink-0 accent-amber-400"
          />
        </label>

        {isPrivate && (
          <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <CookieField
              label="espn_s2"
              value={s2}
              onChange={setS2}
              placeholder={keepsCookies ? "Saved. Leave blank to keep it" : "AEB…%2B…"}
              help="Sign in at fantasy.espn.com on a computer, then open the browser's developer tools (F12). In Chrome or Edge: Application → Cookies → https://fantasy.espn.com. In Firefox: Storage → Cookies. Find espn_s2 and copy its Value. It's long and full of % signs."
            />
            <CookieField
              label="SWID"
              value={swid}
              onChange={setSwid}
              placeholder={keepsCookies ? "Saved. Leave blank to keep it" : "{1A2B3C4D-5E6F-…}"}
              help="In the same cookie list as espn_s2, find SWID and copy its Value, curly braces included, e.g. {1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D}."
            />
            <p className="text-xs text-zinc-500">
              These work like your ESPN password. They're saved only in this browser and sent only to this site, to read your league. Signing out of ESPN changes them.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={checking || !link.trim()}
          className="mt-4 w-full rounded-md bg-amber-400 px-3 py-2 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {checking ? "Checking with ESPN…" : editing ? "Save" : "Add team"}
        </button>
      </form>
    </div>
  );
}

function CookieField({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; help: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const id = useId();
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="font-mono">
          {label}
        </label>
        <button
          type="button"
          aria-label={`How to find ${label}`}
          aria-expanded={showHelp}
          onClick={() => setShowHelp((v) => !v)}
          className="flex size-5 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ?
        </button>
      </div>
      {showHelp && <p className="mt-1 rounded-md bg-zinc-800 px-2.5 py-2 text-xs leading-relaxed text-zinc-200">{help}</p>}
      <input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
      />
    </div>
  );
}
