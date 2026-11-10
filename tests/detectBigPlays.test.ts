import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { detectBigPlays } from "../src/server/espn/detectBigPlays.ts";
import type { EspnCorePlayList, EspnSummary } from "../src/server/espn/espnTypes.ts";
import { DEFAULT_RULES } from "../src/shared/bigPlayRules.ts";
import type { BigPlay } from "../src/shared/types.ts";

const DIR = "fixtures/nfl";
const gameIds = readdirSync(DIR).filter((f) => f.startsWith("summary-")).map((f) => f.slice("summary-".length, -".json".length));

const cache = new Map<string, { summary: EspnSummary; core: EspnCorePlayList }>();
function loadGame(id: string) {
  if (!cache.has(id)) {
    cache.set(id, {
      summary: JSON.parse(readFileSync(`${DIR}/summary-${id}.json`, "utf8")),
      core: JSON.parse(readFileSync(`${DIR}/core-plays-${id}.json`, "utf8")),
    });
  }
  return cache.get(id)!;
}

function detect(gameId: string, rules = DEFAULT_RULES) {
  const { summary, core } = loadGame(gameId);
  return detectBigPlays(summary, core, rules);
}

function playById(gameId: string, playId: string): BigPlay | undefined {
  return detect(gameId).find((p) => p.id === playId);
}

/** Each player's longest run or catch, from ESPN's box score. Checks the detector against a separate source. */
function boxscoreLongs(summary: EspnSummary, group: string, key: string) {
  const longs: { athleteId: string; name: string; long: number }[] = [];
  for (const side of summary.boxscore?.players ?? []) {
    const stats = side.statistics.find((g) => g.name === group);
    const index = stats?.keys?.indexOf(key) ?? -1;
    for (const a of stats?.athletes ?? []) {
      if (index >= 0 && a.stats?.[index]) longs.push({ athleteId: a.athlete.id, name: a.athlete.displayName, long: Number(a.stats[index]) });
    }
  }
  return longs;
}

const finalRuling = (text: string) => text.split(/the play was REVERSED\./i).at(-1) ?? "";

describe.each(gameIds)("game %s", (gameId) => {
  const { summary } = loadGame(gameId);
  const active = () => detect(gameId).filter((p) => p.status === "active");

  it("lists every touchdown, and only touchdowns, as TD", () => {
    const espnTds = (summary.scoringPlays ?? []).filter((p) => p.scoringType?.name === "touchdown").map((p) => p.id).sort();
    expect(active().filter((p) => p.tags.includes("TD")).map((p) => p.id).sort()).toEqual(espnTds);
  });

  it("lists every run of 25+ yards at the box score's length", () => {
    for (const { athleteId, name, long } of boxscoreLongs(summary, "rushing", "longRushing").filter((x) => x.long >= 25)) {
      const match = active().some((p) => p.tags.includes("LONG_RUSH") && p.primaryPlayer?.espnId === athleteId && p.yards === long);
      expect(match, `${name} ${long}-yd run`).toBe(true);
    }
  });

  it("lists every catch of 40+ yards at the box score's length", () => {
    for (const { athleteId, name, long } of boxscoreLongs(summary, "receiving", "longReception").filter((x) => x.long >= 40)) {
      const match = active().some((p) => p.tags.includes("LONG_CATCH") && p.primaryPlayer?.espnId === athleteId && p.yards === long);
      expect(match, `${name} ${long}-yd catch`).toBe(true);
    }
  });

  it("never credits a run or catch with more yards than the box score allows", () => {
    const rushLong = new Map(boxscoreLongs(summary, "rushing", "longRushing").map((x) => [x.athleteId, x.long]));
    const catchLong = new Map(boxscoreLongs(summary, "receiving", "longReception").map((x) => [x.athleteId, x.long]));
    for (const p of active()) {
      const id = p.primaryPlayer?.espnId ?? "";
      if (p.tags.includes("LONG_RUSH")) expect(p.yards, p.rawText).toBeLessThanOrEqual(rushLong.get(id) ?? -1);
      if (p.tags.includes("LONG_CATCH")) expect(p.yards, p.rawText).toBeLessThanOrEqual(catchLong.get(id) ?? -1);
    }
  });

  it("never lists a play wiped out by a penalty", () => {
    for (const p of active()) expect(finalRuling(p.rawText), p.id).not.toMatch(/\bNo Play\b|NULLIFIED/i);
  });

  it("lists each play once", () => {
    const ids = detect(gameId).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a player, position and team for every active play", () => {
    for (const p of active()) {
      expect(p.primaryPlayer?.name, p.rawText).toBeTruthy();
      expect(p.primaryPlayer?.position, p.rawText).toBeTruthy();
      expect(p.primaryPlayer?.team, p.rawText).toBeTruthy();
    }
  });

  it("finds the same plays without the core API, just without players", () => {
    const withCore = detect(gameId).map((p) => [p.id, p.tags.join(",")]);
    const withoutCore = detectBigPlays(summary, null).map((p) => [p.id, p.tags.join(",")]);
    expect(withoutCore).toEqual(withCore);
  });
});

describe("specific plays", () => {
  it("long TD catch: one item, receiver as headline, passer in the note", () => {
    const plays = detect("401873037").filter((p) => p.tags.includes("LONG_CATCH") && p.tags.includes("TD"));
    expect(plays).toHaveLength(1);
    const [play] = plays;
    expect(play!.tags).toEqual(["TD", "LONG_CATCH"]);
    expect(play!.yards).toBe(50);
    expect(play!.primaryPlayer).toMatchObject({ name: "Parker Washington", position: "WR", team: "JAX" });
    expect(play!.secondaryPlayers).toContainEqual(expect.objectContaining({ name: "Trevor Lawrence", role: "passer" }));
    expect(play!.description).toBe("50-yd TD catch from Trevor Lawrence");
  });

  it("pick-six: credited to the interceptor and his defense", () => {
    const play = playById("401873050", "4018730503054")!;
    expect(play.tags).toEqual(["TD", "INT", "PICK_SIX"]);
    expect(play.primaryPlayer).toMatchObject({ name: "Jaylon Johnson", team: "CHI" });
    expect(play.secondaryPlayers).toContainEqual(expect.objectContaining({ name: "Baker Mayfield", role: "passer" }));
    expect(play.defenseTeamId).toBe("3");
    expect(play.yards).toBe(67);
    expect(play.description).toBe("67-yd pick-six off Baker Mayfield");
  });

  it("pick-six that ESPN mislabels as an own fumble recovery", () => {
    const play = playById("401873047", "4018730471924")!;
    expect(play.tags).toEqual(["TD", "INT", "PICK_SIX"]);
    expect(play.primaryPlayer?.name).toBe("Jaden Dugger");
    expect(play.defenseTeamId).toBe("25");
    expect(play.secondaryPlayers.map((s) => s.role)).not.toContain("recoverer");
  });

  it("touchdown nullified by penalty is left out", () => {
    expect(playById("401873047", "4018730473083")).toBeUndefined();
  });

  it("touchdown reversed on review is kept as overturned", () => {
    const play = playById("401873040", "4018730403176")!;
    expect(play.status).toBe("overturned");
    expect(play.tags).toEqual(["TD"]);
    expect(play.primaryPlayer?.name).toBe("CeeDee Lamb");
  });

  it("lost fumble: fumbler as headline, recovering defense credited", () => {
    const play = playById("401873037", "4018730372612")!;
    expect(play.tags).toEqual(["FUMBLE_LOST"]);
    expect(play.primaryPlayer?.name).toBe("Travis Hunter");
    expect(play.defenseTeamId).toBe("33");
  });

  it("fumble the offense recovered is tagged FUMBLE, not lost", () => {
    const play = playById("401873037", "4018730372735")!;
    expect(play.tags).toEqual(["FUMBLE"]);
    expect(play.defenseTeamId).toBeNull();
  });

  it("incompletion reversed to a lost fumble is active", () => {
    const play = playById("401873051", "401873051569")!;
    expect(play.status).toBe("active");
    expect(play.tags).toEqual(["FUMBLE_LOST"]);
    expect(play.defenseTeamId).toBe("2");
  });

  it("lost fumble reversed to a sack is kept as overturned", () => {
    const play = playById("401873051", "4018730511609")!;
    expect(play.status).toBe("overturned");
    expect(play.tags).toEqual(["FUMBLE_LOST"]);
  });

  it("made and missed field goals carry their distance", () => {
    expect(playById("401873037", "401873037480")).toMatchObject({ tags: ["FG"], yards: 53, description: "53-yd FG" });
    const miss = playById("401873038", "4018730383317")!;
    expect(miss).toMatchObject({ tags: ["FG_MISS"], yards: 38, description: "Missed 38-yd FG" });
    expect(miss.primaryPlayer?.name).toBe("Nick Folk");
  });
});

describe("rules", () => {
  it("fumbles: 'lost' drops fumbles the offense recovered", () => {
    const plays = detect("401873037", { ...DEFAULT_RULES, fumbles: "lost" });
    expect(plays.find((p) => p.id === "4018730372735")).toBeUndefined();
    expect(plays.find((p) => p.id === "4018730372612")?.tags).toEqual(["FUMBLE_LOST"]);
  });

  it("fumbles: 'none' drops all fumbles", () => {
    const plays = detect("401873037", { ...DEFAULT_RULES, fumbles: "none" });
    expect(plays.some((p) => p.tags.includes("FUMBLE") || p.tags.includes("FUMBLE_LOST"))).toBe(false);
  });

  it("field goals can be turned off", () => {
    const plays = detect("401873038", { ...DEFAULT_RULES, fieldGoals: { made: false, missed: false } });
    expect(plays.some((p) => p.tags.includes("FG") || p.tags.includes("FG_MISS"))).toBe(false);
  });

  it("yardage thresholds are configurable", () => {
    const plays = gameIds.flatMap((id) => detect(id, { ...DEFAULT_RULES, longRushYards: 99, longCatchYards: 99 }));
    expect(plays.some((p) => p.tags.includes("LONG_RUSH") || p.tags.includes("LONG_CATCH"))).toBe(false);
  });
});

// Uses Monday night's recording, which is git-ignored, so this only runs where it exists.
const LIVE_DIR = "fixtures/live/401873051";
describe.skipIf(!existsSync(LIVE_DIR))("live recording of BUF @ MIN", () => {
  it("everything flagged during the game is still listed at the end, active or overturned", () => {
    const files = readdirSync(LIVE_DIR).filter((f) => f.startsWith("summary-")).sort();
    const final = new Map(detect("401873051").map((p) => [p.id, p]));
    for (const [i, file] of files.entries()) {
      if (i % 3 !== 0 && i !== files.length - 1) continue;
      const summary = JSON.parse(gunzipSync(readFileSync(`${LIVE_DIR}/${file}`)).toString()) as EspnSummary;
      for (const play of detectBigPlays(summary, null)) {
        expect(final.has(play.id), `${file}: ${play.rawText}`).toBe(true);
      }
    }
  }, 120_000);
});
