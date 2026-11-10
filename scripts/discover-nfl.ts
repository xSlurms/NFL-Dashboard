// Saves the scoreboard, plus the summary and core-API play list for every finished game this week.
import { NFL_BASE, getJson, save, sleep } from "./lib.ts";

const board = await getJson(`${NFL_BASE}/scoreboard`);
save("fixtures/nfl/scoreboard.json", board);

const finished = board.events.filter((e: any) => e.competitions[0].status.type.state === "post");
console.log(`Week ${board.week.number}: ${board.events.length} games, ${finished.length} finished`);

for (const event of finished) {
  const summary = await getJson(`${NFL_BASE}/summary?event=${event.id}`);
  save(`fixtures/nfl/summary-${event.id}.json`, summary);
  const core = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${event.id}/competitions/${event.id}/plays?limit=400`;
  save(`fixtures/nfl/core-plays-${event.id}.json`, await getJson(core));
  console.log(`Saved ${event.shortName} (${event.id})`);
  await sleep(500);
}
