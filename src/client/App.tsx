import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { playChime, showNotification } from "./alerts.ts";
import type { ClientSource } from "./api.ts";
import { Header } from "./components/Header.tsx";
import { Matchup } from "./components/Matchup.tsx";
import { ScoreboardPanel } from "./components/Scoreboard.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { Ticker } from "./components/Ticker.tsx";
import { Toasts, type Toast } from "./components/Toasts.tsx";
import type { ReplayClock } from "./replaySource.ts";
import { loadSettings, saveSettings, type Settings } from "./settings.ts";
import { useDashboard, type Alert } from "./useDashboard.ts";

export interface ReplayHandle {
  clock: ReplayClock;
  bar: ReactNode;
}

export function App({ source, replay, notice }: { source: ClientSource; replay?: ReplayHandle; notice?: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);

  // A replay seek remounts the dashboard, so a jump starts clean instead of firing a burst of alerts.
  const epoch = useSyncExternalStore(
    useCallback((listener: () => void) => replay?.clock.subscribe(listener) ?? (() => {}), [replay]),
    () => replay?.clock.epoch ?? 0,
  );

  return (
    <>
      {notice && <div className="bg-red-900/60 px-4 py-2 text-sm text-red-100">{notice}</div>}
      <Dashboard key={epoch} source={source} settings={settings} onSettings={setSettings} replaying={!!replay} />
      {replay?.bar}
    </>
  );
}

function Dashboard({ source, settings, onSettings, replaying }: { source: ClientSource; settings: Settings; onSettings: (s: Settings) => void; replaying: boolean }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onAlerts = useCallback(
    (alerts: Alert[]) => {
      setToasts((current) => [...alerts.map((alert) => ({ id: `${alert.play.id}:${alert.kind}`, alert })), ...current].slice(0, 6));
      for (const alert of alerts) {
        if (settings.notifications) showNotification(alert);
        if (settings.sound) playChime(alert.owner);
      }
    },
    [settings.notifications, settings.sound],
  );

  const state = useDashboard(source, settings, onAlerts);
  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  return (
    <div className={`mx-auto max-w-7xl px-4 pt-3 ${replaying ? "pb-28" : "pb-8"}`}>
      <Header state={state} onOpenSettings={() => setSettingsOpen(true)} />
      <Ticker
        store={state.store}
        board={state.board}
        fantasy={state.fantasy}
        filter={settings.tickerFilter}
        onFilter={(tickerFilter) => onSettings({ ...settings, tickerFilter })}
        error={state.errors.plays}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <ScoreboardPanel board={state.board} fantasy={state.fantasy} possession={state.possession} error={state.errors.scoreboard} />
        </div>
        <div className="order-1 lg:order-2">
          <Matchup fantasy={state.fantasy} board={state.board} error={state.errors.fantasy} />
        </div>
      </div>
      <Toasts toasts={toasts} onDismiss={dismiss} aboveBar={replaying} />
      {settingsOpen && <SettingsPanel settings={settings} fantasy={state.fantasy} onChange={onSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
