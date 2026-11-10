// Browser notifications and the alert chime. Both are opt-in from the settings panel.
import type { Alert } from "./useDashboard.ts";

export function alertTitle(alert: Alert): string {
  const who = alert.owner === "me" ? "Your player" : "Opponent's player";
  return alert.kind === "overturned" ? `Overturned: ${who.toLowerCase()}` : who;
}

export function alertBody(alert: Alert): string {
  const p = alert.play.primaryPlayer;
  const name = p ? `${p.name}, ${p.position}, ${p.team}: ` : "";
  return `${name}${alert.play.description}`;
}

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

/** Must be called from a click, so the browser shows the permission prompt. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function showNotification(alert: Alert): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(alertTitle(alert), { body: alertBody(alert), tag: alert.play.id });
  } catch {
    // Some mobile browsers only allow notifications from a service worker; the toast still shows.
  }
}

let audio: AudioContext | null = null;

/** Call from a click first: browsers only let audio start after the user interacts. */
export function unlockSound(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

export function playChime(owner: Alert["owner"]): void {
  if (!audio || audio.state !== "running") return;
  // Two rising notes for my player, two falling notes for the opponent's.
  const notes = owner === "me" ? [660, 880] : [520, 390];
  notes.forEach((frequency, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    const start = audio!.currentTime + i * 0.15;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(audio!.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });
}
