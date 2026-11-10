import { useEffect, useRef, useState } from "react";
import type { BigPlayRules } from "../../shared/bigPlayRules.ts";
import type { FantasyMatchup } from "../../shared/types.ts";
import { clearAccessKey, getAccessKey } from "../accessKey.ts";
import { notificationsSupported, playChime, requestNotificationPermission, unlockSound } from "../alerts.ts";
import { DEFAULT_SETTINGS, POLL_CHOICES, type Settings } from "../settings.ts";

interface Props {
  settings: Settings;
  fantasy: FantasyMatchup | null;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, fantasy, onChange, onClose }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const setRules = (rules: Partial<BigPlayRules>) => onChange({ ...settings, rules: { ...settings.rules, ...rules } });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleNotifications = async (on: boolean) => {
    setNotice(null);
    if (!on) return onChange({ ...settings, notifications: false });
    if (!notificationsSupported()) return setNotice("This browser doesn't support notifications.");
    if (await requestNotificationPermission()) onChange({ ...settings, notifications: true });
    else setNotice("Notifications are blocked for this site. Allow them in the browser's site settings, then try again.");
  };

  const toggleSound = (on: boolean) => {
    if (on) {
      unlockSound();
      setTimeout(() => playChime("me"), 50);
    }
    onChange({ ...settings, sound: on });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="h-full w-full max-w-sm overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-semibold">
            Settings
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800">
            Close
          </button>
        </div>

        <Section title="Big plays">
          <YardsField label="Long rush, yards" value={settings.rules.longRushYards} onCommit={(v) => setRules({ longRushYards: v })} />
          <YardsField label="Long catch, yards" value={settings.rules.longCatchYards} onCommit={(v) => setRules({ longCatchYards: v })} />
          <Row label="Fumbles">
            <select
              value={settings.rules.fumbles}
              onChange={(e) => setRules({ fumbles: e.target.value as BigPlayRules["fumbles"] })}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              <option value="all">All, lost or not</option>
              <option value="lost">Lost only</option>
              <option value="none">None</option>
            </select>
          </Row>
          <Check label="Made field goals" checked={settings.rules.fieldGoals.made} onChange={(made) => setRules({ fieldGoals: { ...settings.rules.fieldGoals, made } })} />
          <Check label="Missed field goals" checked={settings.rules.fieldGoals.missed} onChange={(missed) => setRules({ fieldGoals: { ...settings.rules.fieldGoals, missed } })} />
        </Section>

        <Section title="Updates">
          <Row label="Refresh during games">
            <select
              value={settings.pollSeconds}
              onChange={(e) => onChange({ ...settings, pollSeconds: Number(e.target.value) as Settings["pollSeconds"] })}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              {POLL_CHOICES.map((s) => (
                <option key={s} value={s}>
                  every {s}s
                </option>
              ))}
            </select>
          </Row>
          <p className="text-xs text-zinc-500">When no game is on, the page refreshes every 5 minutes.</p>
        </Section>

        <Section title="Alerts for my matchup">
          <p className="text-xs text-zinc-500">A toast always appears in the page. These add to it.</p>
          <Check label="Browser notifications" checked={settings.notifications} onChange={toggleNotifications} />
          <Check label="Sound" checked={settings.sound} onChange={toggleSound} />
          {notice && <p className="text-xs text-amber-400">{notice}</p>}
        </Section>

        <Section title="League">
          <p className="text-xs text-zinc-500">Set on the server, so this page can't be pointed at another league.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-400">League</dt>
            <dd>{fantasy?.leagueId ?? "–"}</dd>
            <dt className="text-zinc-400">Team</dt>
            <dd>{fantasy ? `${fantasy.me.name} (#${fantasy.me.teamId})` : "–"}</dd>
            <dt className="text-zinc-400">Season</dt>
            <dd>{fantasy?.season ?? "–"}</dd>
          </dl>
          {getAccessKey() !== null && (
            <button
              type="button"
              onClick={() => {
                clearAccessKey();
                location.reload();
              }}
              className="text-xs text-zinc-400 underline hover:text-zinc-200"
            >
              Forget the access key on this device
            </button>
          )}
        </Section>

        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_SETTINGS, tickerFilter: settings.tickerFilter })}
          className="mt-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-amber-400" />
    </label>
  );
}

/** Keeps the typed text locally and commits only whole numbers from 1 to 99, so half-typed values don't refetch. */
function YardsField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= 1 && n <= 99;
  return (
    <Row label={label}>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (valid ? n !== value && onCommit(n) : setText(String(value)))}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-invalid={!valid}
        className={`w-20 rounded-md border bg-zinc-950 px-2 py-1 text-right ${valid ? "border-zinc-700" : "border-red-500"}`}
      />
    </Row>
  );
}
