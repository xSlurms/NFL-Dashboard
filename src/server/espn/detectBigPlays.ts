import type { BigPlay, BigPlayTag, PlayerRef, SecondaryPlayer } from "../../shared/types.ts";
import { DEFAULT_RULES, type BigPlayRules } from "../../shared/bigPlayRules.ts";
import type { EspnCorePlayList, EspnPlay, EspnSummary } from "./espnTypes.ts";

// ESPN core-API position IDs (from sports.core.api.espn.com/.../nfl/positions/{id}).
const POSITIONS: Record<string, string> = {
  "1": "WR", "4": "C", "7": "TE", "8": "QB", "9": "RB", "10": "FB", "22": "K", "23": "P", "29": "CB",
  "30": "LB", "31": "DE", "32": "DT", "35": "DB", "36": "S", "46": "OT", "73": "G", "78": "LS",
};

interface Athlete {
  id: string;
  name: string;
  teamId: string;
  team: string;
  /** How play text names the player: "F.Last", lowercased. */
  abbreviation: string;
}

/** Role name -> athlete IDs in ESPN's order, plus each athlete's position. */
interface Roles {
  byRole: Map<string, string[]>;
  positions: Map<string, string>;
}

/** What one stretch of play text says happened. */
interface Facts {
  noPlay: boolean;
  touchdown: boolean;
  intercepted: boolean;
  fumble: boolean;
  ownRecovery: boolean;
  recoveredByName: string | null;
  kind: "pass" | "rush" | "return" | "fieldGoal" | "other";
  completed: boolean;
  yards: number | null;
  fieldGoal: "made" | "missed" | "blocked" | null;
  returnKind: "kickoff" | "punt" | null;
}

const NO_ROLES: Roles = { byRole: new Map(), positions: new Map() };

/**
 * Finds the big plays in one game.
 * The summary gives the plays; the core play list (optional) gives the players involved.
 * Without it, plays are still found but carry no player.
 */
export function detectBigPlays(
  summary: EspnSummary,
  corePlays: EspnCorePlayList | null,
  rules: BigPlayRules = DEFAULT_RULES,
): BigPlay[] {
  const gameId = summary.header.id;
  const competitors = summary.header.competitions[0]?.competitors ?? [];
  const homeId = competitors.find((c) => c.homeAway === "home")?.team.id ?? null;
  const awayId = competitors.find((c) => c.homeAway === "away")?.team.id ?? null;
  const otherTeam = (teamId: string | null | undefined) =>
    teamId === homeId ? awayId : teamId === awayId ? homeId : null;

  const athletes = readAthletes(summary);
  const roleIndex = new Map((corePlays?.items ?? []).map((p) => [p.id, readRoles(p.participants)]));

  const plays = new Map<string, EspnPlay>();
  for (const drive of summary.drives?.previous ?? []) for (const p of drive.plays ?? []) plays.set(p.id, p);
  for (const p of summary.drives?.current?.plays ?? []) plays.set(p.id, p);
  const ordered = [...plays.values()].sort((a, b) => Number(a.sequenceNumber ?? 0) - Number(b.sequenceNumber ?? 0));

  const found: BigPlay[] = [];
  for (const play of ordered) {
    const text = (play.text ?? "").replace(/\s+/g, " ").trim();
    const segments = text.split(/the play was REVERSED\./i);
    const offenseTeamId = play.start?.team?.id ?? null;
    const roles = roleIndex.get(play.id) ?? NO_ROLES;
    // On kick returns and interception returns, the other team is carrying the ball when it comes loose.
    const carrierTeam = (f: Facts) => (f.returnKind || f.intercepted ? otherTeam(offenseTeamId) : offenseTeamId);

    // The final ruling, read with ESPN's flags as hints.
    let facts = readFacts(segments.at(-1) ?? "", play.scoringPlay === true);
    let lost = isFumbleLost(facts, roles, athletes, play.type?.text ?? null, carrierTeam(facts));
    let tags = tagsFor(facts, lost, rules);
    let status: BigPlay["status"] = "active";

    // A big play that review took away is kept and marked overturned.
    if (tags.length === 0 && segments.length > 1) {
      const before = readFacts(segments.slice(0, -1).join(" "), null);
      const beforeLost = isFumbleLost(before, NO_ROLES, athletes, null, carrierTeam(before));
      const beforeTags = tagsFor(before, beforeLost, rules);
      if (beforeTags.length > 0) {
        facts = before;
        lost = beforeLost;
        tags = beforeTags;
        status = "overturned";
      }
    }
    if (tags.length === 0) continue;

    const primaryId = pickPrimary(tags, roles);
    const primaryPlayer = primaryId ? toPlayerRef(primaryId, roles, athletes) : null;
    const secondaryPlayers = pickSecondary(tags, facts, roles, athletes, primaryId);
    const teamOf = (id: string | undefined) => (id ? athletes.get(id)?.teamId ?? null : null);

    let defenseTeamId: string | null = null;
    if (tags.includes("INT")) {
      defenseTeamId = teamOf(first(roles, "returner") ?? first(roles, "passDefender")) ?? otherTeam(offenseTeamId);
    } else if (tags.includes("FUMBLE_LOST")) {
      defenseTeamId =
        teamOf(roles.byRole.get("recoverer")?.at(-1)) ??
        findByAbbreviation(facts.recoveredByName, athletes)?.teamId ??
        otherTeam(teamOf(first(roles, "fumbler")) ?? offenseTeamId);
    }
    if (!defenseTeamId && tags.includes("TD") && primaryPlayer && offenseTeamId && primaryPlayer.teamId !== offenseTeamId) {
      defenseTeamId = primaryPlayer.teamId;
    }

    found.push({
      id: play.id,
      gameId,
      tags,
      primaryPlayer,
      secondaryPlayers,
      defenseTeamId,
      yards: facts.yards,
      description: describe(tags, facts, secondaryPlayers),
      rawText: text,
      quarter: play.period?.number ?? 0,
      clock: play.clock?.displayValue ?? "",
      wallclock: play.wallclock ?? null,
      scoreAfter: { home: play.homeScore ?? 0, away: play.awayScore ?? 0 },
      status,
      fantasyOwner: null,
    });
  }
  return found;
}

// ---------- Reading play text

const SHORT_FORM = /^(.+?) (\d+) Yd (Rush|pass from|Interception Return|Fumble Return|Kickoff Return|Punt Return|Field Goal)/i;

function firstYards(text: string): number | null {
  const m = text.match(/ for (-?\d+) yards?| for no gain/);
  if (!m) return null;
  return m[1] === undefined ? 0 : Number(m[1]);
}

/**
 * Reads one stretch of play text. `scoringPlay` is ESPN's flag for the final ruling,
 * or null when reading the text from before a reversal.
 * ESPN's play type is not used here because it is sometimes wrong (a pick-six labeled as an own fumble recovery).
 */
function readFacts(segment: string, scoringPlay: boolean | null): Facts {
  const text = segment.trim();
  // The play itself, without 2-point tries, penalties, injury notes or the extra point.
  const main = text.split(/TWO-POINT CONVERSION|PENALTY on|Penalty on|\*\* Injury Update|extra point/)[0] ?? "";
  const short = main.match(SHORT_FORM);
  const shortKind = short?.[3]?.toLowerCase() ?? null;

  const noPlay = /\bNo Play\b/i.test(text) || /\bNULLIFIED\b/i.test(text);
  const intercepted = /INTERCEPTED/.test(main) || shortKind === "interception return";
  const fumble = /FUMBLES/.test(main) || shortKind === "fumble return";

  let fieldGoal: Facts["fieldGoal"] = null;
  let fieldGoalDistance: number | null = null;
  const fg = main.match(/(\d+) (?:yard|Yd) field goal(?: is (GOOD|No Good|BLOCKED))?/i);
  if (fg) {
    fieldGoalDistance = Number(fg[1]);
    const result = fg[2]?.toUpperCase();
    if (result === "GOOD") fieldGoal = "made";
    else if (result === "NO GOOD") fieldGoal = "missed";
    else if (result === "BLOCKED") fieldGoal = "blocked";
    else if (scoringPlay) fieldGoal = "made";
  }

  const isKick = /\b(kicks|punts)\b/.test(main);
  const sacked = /\bsacked\b/.test(main);
  const pass = !isKick && !fieldGoal && (/\bpass\b/i.test(main) || shortKind === "pass from");
  const completed = pass && !intercepted && !sacked && !/\bincomplete\b/i.test(main);
  const rush =
    !pass && !isKick && !fieldGoal && !sacked && !intercepted && !/\bkneels\b/.test(main) &&
    (shortKind === "rush" || firstYards(main) !== null);

  let yards = short ? Number(short[2]) : firstYards(main);
  if (intercepted && !short) yards = firstYards(main.slice(main.search(/INTERCEPTED/)));
  if (fieldGoal) yards = fieldGoalDistance;

  const touchdown =
    (/TOUCHDOWN/.test(main) && !/TOUCHDOWN NULLIFIED/.test(text)) ||
    (scoringPlay === true && !fieldGoal && !/\bSAFETY\b/i.test(text));

  const recoveries = [...main.matchAll(/RECOVERED by [A-Z]{2,4}-(.+?) at /gi)];

  return {
    noPlay,
    touchdown,
    intercepted,
    fumble,
    ownRecovery: /\band recovers\b/.test(main),
    recoveredByName: recoveries.at(-1)?.[1] ?? null,
    kind: fieldGoal ? "fieldGoal" : pass ? "pass" : rush ? "rush" : isKick || intercepted || short ? "return" : "other",
    completed,
    yards,
    fieldGoal,
    returnKind: shortKind === "kickoff return" || /\bkicks\b/.test(main) ? "kickoff"
      : shortKind === "punt return" || /\bpunts\b/.test(main) ? "punt" : null,
  };
}

function tagsFor(f: Facts, lost: boolean, rules: BigPlayRules): BigPlayTag[] {
  if (f.noPlay) return [];
  const tags: BigPlayTag[] = [];
  if (f.touchdown) tags.push("TD");
  if (f.kind === "rush" && f.yards !== null && f.yards >= rules.longRushYards) tags.push("LONG_RUSH");
  if (f.kind === "pass" && f.completed && f.yards !== null && f.yards >= rules.longCatchYards) tags.push("LONG_CATCH");
  if (f.intercepted) {
    tags.push("INT");
    if (f.touchdown) tags.push("PICK_SIX");
  }
  if (f.fumble && (rules.fumbles === "all" || (rules.fumbles === "lost" && lost))) tags.push(lost ? "FUMBLE_LOST" : "FUMBLE");
  if (f.fieldGoal === "made" && rules.fieldGoals.made) tags.push("FG");
  if ((f.fieldGoal === "missed" || f.fieldGoal === "blocked") && rules.fieldGoals.missed) tags.push("FG_MISS");
  return tags;
}

function isFumbleLost(f: Facts, roles: Roles, athletes: Map<string, Athlete>, typeText: string | null, carrierTeamId: string | null): boolean {
  if (!f.fumble || f.ownRecovery) return false;
  const fumblerTeam = athletes.get(first(roles, "fumbler") ?? "")?.teamId;
  const recovererTeam = athletes.get(roles.byRole.get("recoverer")?.at(-1) ?? "")?.teamId;
  if (fumblerTeam && recovererTeam) return fumblerTeam !== recovererTeam;
  if (typeText && /\(Opponent\)|Opp Fumble/.test(typeText)) return true;
  if (typeText && /\(Own\)/.test(typeText)) return false;
  const recoveredBy = findByAbbreviation(f.recoveredByName, athletes);
  const losingTeam = fumblerTeam ?? carrierTeamId;
  return Boolean(recoveredBy && losingTeam && recoveredBy.teamId !== losingTeam);
}

// ---------- Players

function readAthletes(summary: EspnSummary): Map<string, Athlete> {
  const athletes = new Map<string, Athlete>();
  for (const side of summary.boxscore?.players ?? []) {
    for (const group of side.statistics) {
      for (const { athlete } of group.athletes) {
        athletes.set(athlete.id, {
          id: athlete.id,
          name: athlete.displayName,
          teamId: side.team.id,
          team: side.team.abbreviation,
          abbreviation: `${athlete.firstName?.[0] ?? ""}.${athlete.lastName ?? ""}`.toLowerCase(),
        });
      }
    }
  }
  return athletes;
}

/** Fallback for when the core API has no participants: match a name from the play text, e.g. "A.Van Ginkel". */
function findByAbbreviation(name: string | null, athletes: Map<string, Athlete>): Athlete | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  for (const athlete of athletes.values()) if (athlete.abbreviation === wanted) return athlete;
  return undefined;
}

function readRoles(participants: { type: string; athlete?: { $ref: string }; position?: { $ref: string } }[] = []): Roles {
  const roles: Roles = { byRole: new Map(), positions: new Map() };
  for (const p of participants) {
    const athleteId = p.athlete?.$ref.match(/athletes\/(\d+)/)?.[1];
    if (!athleteId) continue;
    const list = roles.byRole.get(p.type) ?? [];
    list.push(athleteId);
    roles.byRole.set(p.type, list);
    const position = POSITIONS[p.position?.$ref.match(/positions\/(\d+)/)?.[1] ?? ""];
    if (position && !roles.positions.has(athleteId)) roles.positions.set(athleteId, position);
  }
  return roles;
}

const first = (roles: Roles, role: string) => roles.byRole.get(role)?.[0];

function pickPrimary(tags: BigPlayTag[], roles: Roles): string | undefined {
  const any = (...names: string[]) => names.map((n) => first(roles, n)).find(Boolean);
  if (tags.includes("TD")) return any("scorer", "receiver", "rusher", "returner");
  if (tags.includes("INT")) return any("returner", "passDefender");
  if (tags.includes("FG") || tags.includes("FG_MISS")) return any("kicker");
  if (tags.includes("LONG_CATCH")) return any("receiver");
  if (tags.includes("LONG_RUSH")) return any("rusher");
  return any("fumbler", "receiver", "rusher", "passer");
}

function pickSecondary(tags: BigPlayTag[], f: Facts, roles: Roles, athletes: Map<string, Athlete>, primaryId: string | undefined): SecondaryPlayer[] {
  const fumble = tags.includes("FUMBLE") || tags.includes("FUMBLE_LOST");
  const wanted: [string, boolean][] = [
    ["passer", f.kind === "pass" || f.intercepted],
    ["receiver", f.completed],
    ["rusher", f.kind === "rush"],
    ["returner", tags.includes("TD")],
    ["scorer", tags.includes("TD")],
    ["fumbler", fumble],
    ["recoverer", fumble],
    ["forcedBy", fumble],
  ];
  const seen = new Set(primaryId ? [primaryId] : []);
  const players: SecondaryPlayer[] = [];
  for (const [role, include] of wanted) {
    if (!include) continue;
    for (const id of roles.byRole.get(role) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const athlete = athletes.get(id);
      players.push({ espnId: id, name: athlete?.name ?? `Player ${id}`, role, teamId: athlete?.teamId ?? "" });
    }
  }
  return players;
}

function toPlayerRef(id: string, roles: Roles, athletes: Map<string, Athlete>): PlayerRef {
  const athlete = athletes.get(id);
  return {
    espnId: id,
    name: athlete?.name ?? `Player ${id}`,
    position: roles.positions.get(id) ?? "",
    team: athlete?.team ?? "",
    teamId: athlete?.teamId ?? "",
  };
}

// ---------- Ticker note

function describe(tags: BigPlayTag[], f: Facts, secondary: SecondaryPlayer[]): string {
  const yd = f.yards !== null ? `${f.yards}-yd ` : "";
  const passer = secondary.find((s) => s.role === "passer")?.name;
  const parts: string[] = [];

  if (tags.includes("PICK_SIX")) parts.push(`${yd}pick-six${passer ? ` off ${passer}` : ""}`);
  else if (tags.includes("INT")) parts.push(`INT${passer ? ` of ${passer}` : ""}${f.yards ? `, ${f.yards}-yd return` : ""}`);
  else if (tags.includes("TD") && tags.includes("FUMBLE_LOST")) parts.push("fumble return TD");
  else if (tags.includes("TD")) {
    if (f.kind === "rush") parts.push(`${yd}rush TD`);
    else if (f.kind === "pass") parts.push(`${yd}TD catch${passer ? ` from ${passer}` : ""}`);
    else if (f.returnKind) parts.push(`${yd}${f.returnKind} return TD`);
    else if (f.fieldGoal) parts.push("blocked FG return TD");
    else parts.push("TD");
  } else if (tags.includes("LONG_RUSH")) parts.push(`${yd}rush`);
  else if (tags.includes("LONG_CATCH")) parts.push(`${yd}catch${passer ? ` from ${passer}` : ""}`);

  if (tags.includes("FG")) parts.push(`${yd}FG`);
  if (tags.includes("FG_MISS")) parts.push(`${f.fieldGoal === "blocked" ? "blocked" : "missed"} ${yd}FG`);
  if (tags.includes("FUMBLE_LOST") && !tags.includes("TD")) parts.push("fumble lost");
  if (tags.includes("FUMBLE")) parts.push("fumble, recovered by own team");

  const note = parts.join(", ");
  return note.charAt(0).toUpperCase() + note.slice(1);
}
