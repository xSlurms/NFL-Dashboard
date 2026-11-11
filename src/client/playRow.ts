// How a big play reads as one row of the ticker table: its color, a short player name, and the score after it.
import type { BigPlay, Game } from "../shared/types.ts";

/** What the row is colored by. A play with several tags takes the most important one. */
export type PlayTone = "turnoverTd" | "td" | "turnover" | "long" | "fg" | "fumbleKept" | "miss" | "overturned";

export function playTone(play: BigPlay): PlayTone {
  const has = (tag: BigPlay["tags"][number]) => play.tags.includes(tag);
  if (play.status === "overturned") return "overturned";
  const turnover = has("INT") || has("FUMBLE_LOST") || has("PICK_SIX");
  if (has("PICK_SIX") || (has("TD") && turnover)) return "turnoverTd";
  if (has("TD")) return "td";
  if (turnover) return "turnover";
  if (has("LONG_RUSH") || has("LONG_CATCH")) return "long";
  if (has("FG")) return "fg";
  if (has("FUMBLE")) return "fumbleKept";
  return "miss";
}

/** The tags worth showing: "PICK SIX" already says TD and INT. */
export function rowTags(play: BigPlay): BigPlay["tags"] {
  return play.tags.includes("PICK_SIX") ? play.tags.filter((t) => t !== "TD" && t !== "INT") : play.tags;
}

/** "Amon-Ra St. Brown" → "A. St. Brown". A first name that's already initials ("D.J.") stays. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || parts[0].endsWith(".")) return parts.join(" ");
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** The leader first, e.g. "DAL 21–14"; a tie reads "14–14". */
export function scoreAfterLabel(play: BigPlay, game: Game | undefined): string {
  const { home, away } = play.scoreAfter;
  if (!game) return `${away}–${home}`;
  if (home === away) return `${home}–${away}`;
  return home > away ? `${game.home.abbreviation} ${home}–${away}` : `${game.away.abbreviation} ${away}–${home}`;
}
