// Waits for kickoff, then snapshots one game until it ends.
// Usage: npm run record:live -- <eventId>
// Writes gzipped JSON to fixtures/live/<eventId>/: summary every 30s, scoreboard and fantasy every 60s.
import { NFL_BASE, getLiveFantasy, getJson, save, sleep } from "./lib.ts";

const eventId = process.argv[2];
if (!eventId) {
  console.error("Usage: npm run record:live -- <eventId>");
  process.exit(1);
}

const TICK_MS = 30_000;
const START_BEFORE_KICKOFF_MS = 5 * 60_000;
const MAX_RECORDING_MS = 6 * 60 * 60_000;
const dir = `fixtures/live/${eventId}`;

const log = (message: string) => console.log(`${new Date().toLocaleTimeString()}  ${message}`);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const messageOf = (error: unknown) => (error as Error).message;

async function readBoard() {
  const board = await getJson(`${NFL_BASE}/scoreboard`);
  const event = board.events.find((e: any) => e.id === eventId);
  if (!event) throw new Error(`Event ${eventId} is not on this week's scoreboard`);
  return { board, event, state: event.competitions[0].status.type.state as string };
}

async function waitForKickoff() {
  for (;;) {
    try {
      const { event, state } = await readBoard();
      const untilStart = Date.parse(event.date) - START_BEFORE_KICKOFF_MS - Date.now();
      if (state !== "pre" || untilStart <= 0) return;
      log(`${event.shortName}: recording starts in ${Math.ceil(untilStart / 60_000)} min`);
      await sleep(Math.min(untilStart, 10 * 60_000));
    } catch (error) {
      log(`Waiting: ${messageOf(error)}`);
      await sleep(60_000);
    }
  }
}

await waitForKickoff();
log("Recording");

const startedAt = Date.now();
let lastFantasyResult = "";
let finished = false;

for (let tick = 0; !finished && Date.now() - startedAt < MAX_RECORDING_MS; tick++) {
  const tickStart = Date.now();
  const time = stamp();

  if (tick % 2 === 0) {
    try {
      const { board, state } = await readBoard();
      save(`${dir}/scoreboard-${time}.json.gz`, board, true);
      finished = state === "post";

      let fantasyResult = "Fantasy snapshots OK";
      try {
        save(`${dir}/fantasy-${time}.json.gz`, await getLiveFantasy(board.week.number), true);
      } catch (error) {
        fantasyResult = `Fantasy skipped: ${messageOf(error)}`;
      }
      if (fantasyResult !== lastFantasyResult) log(fantasyResult);
      lastFantasyResult = fantasyResult;
    } catch (error) {
      log(`Scoreboard failed: ${messageOf(error)}`);
    }
  }

  // Runs after the scoreboard check so the last snapshot is taken with the game final.
  try {
    save(`${dir}/summary-${time}.json.gz`, await getJson(`${NFL_BASE}/summary?event=${eventId}`), true);
    log(`Snapshot ${tick + 1}`);
  } catch (error) {
    log(`Summary failed: ${messageOf(error)}`);
  }

  if (!finished) await sleep(Math.max(0, TICK_MS - (Date.now() - tickStart)));
}

log(finished ? "Game final. Recording finished." : "Hit the 6-hour limit. Recording stopped.");
