import type { BigPlayTag, BigPlay } from "../../shared/types.ts";

export const TAG_LABELS: Record<BigPlayTag, string> = {
  TD: "TD",
  LONG_RUSH: "LONG RUSH",
  LONG_CATCH: "LONG CATCH",
  INT: "INT",
  PICK_SIX: "PICK SIX",
  FUMBLE: "FUMBLE",
  FUMBLE_LOST: "FUMBLE LOST",
  FG: "FG",
  FG_MISS: "FG MISSED",
};

const TAG_STYLES: Record<BigPlayTag, string> = {
  TD: "bg-emerald-500/20 text-emerald-300",
  LONG_RUSH: "bg-sky-500/20 text-sky-300",
  LONG_CATCH: "bg-sky-500/20 text-sky-300",
  INT: "bg-rose-500/20 text-rose-300",
  PICK_SIX: "bg-rose-500/30 text-rose-200",
  FUMBLE: "bg-yellow-500/15 text-yellow-200",
  FUMBLE_LOST: "bg-rose-500/20 text-rose-300",
  FG: "bg-zinc-500/25 text-zinc-200",
  FG_MISS: "bg-zinc-500/25 text-zinc-300",
};

export function TagChip({ tag }: { tag: BigPlayTag }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${TAG_STYLES[tag]}`}>{TAG_LABELS[tag]}</span>;
}

export const quarterLabel = (quarter: number) => (quarter >= 5 ? "OT" : quarter > 0 ? `Q${quarter}` : "");

export const playTime = (play: BigPlay) => [quarterLabel(play.quarter), play.clock].filter(Boolean).join(" ");

export function Panel({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">{title}</h2>
        {aside}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function TeamLogo({ src, alt, size = 24 }: { src: string | null | undefined; alt: string; size?: number }) {
  if (!src) return <span style={{ width: size, height: size }} className="inline-block shrink-0" />;
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" className="shrink-0 object-contain" />;
}

export const fmtPoints = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toFixed(n % 1 === 0 ? 0 : 1));
