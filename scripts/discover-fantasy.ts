// Saves league, roster and matchup data for the current week to the git-ignored fantasy fixtures.
import { NFL_BASE, getFantasy, getJson, save } from "./lib.ts";

const board = await getJson(`${NFL_BASE}/scoreboard`);
const week: number = board.week.number;

try {
  const league = await getFantasy(week);
  save(`fixtures/fantasy/league-week${week}.json`, league);
  console.log(`Saved league data for week ${week}: ${league.teams?.length ?? 0} teams`);
} catch (error) {
  console.error(`Fantasy request failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
