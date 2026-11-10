import { useEffect } from "react";
import { alertBody, alertTitle } from "../alerts.ts";
import type { Alert } from "../useDashboard.ts";
import { TagChip } from "./ui.tsx";

export interface Toast {
  id: string;
  alert: Alert;
}

const TOAST_MS = 12_000;

export function Toasts({ toasts, onDismiss, aboveBar }: { toasts: Toast[]; onDismiss: (id: string) => void; aboveBar: boolean }) {
  return (
    <div aria-live="assertive" className={`pointer-events-none fixed inset-x-4 z-40 flex flex-col items-end gap-2 sm:left-auto sm:w-96 ${aboveBar ? "bottom-36 sm:bottom-24" : "bottom-4"}`}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast.id, onDismiss]);

  const { alert } = toast;
  const mine = alert.owner === "me";
  return (
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      className={`pointer-events-auto w-full animate-toast-in rounded-lg border-2 bg-zinc-900 px-3 py-2 text-left shadow-xl shadow-black/50 ${mine ? "border-mine" : "border-theirs"}`}
    >
      <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${mine ? "text-mine" : "text-theirs"}`}>
        {alertTitle(alert)}
        <span className="flex gap-1">
          {alert.play.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </span>
        <span className="ml-auto font-normal text-zinc-500">dismiss</span>
      </p>
      <p className={`text-sm ${alert.kind === "overturned" ? "line-through text-zinc-400" : ""}`}>{alertBody(alert)}</p>
    </button>
  );
}
