# Live Football Tracker: Build Plan

Hand this file to Claude Code. Start with: "Read PLAN.md. Do Phase 0, show me what you found, then stop."

## 1. Goal

A personal web page for NFL Sundays (and Thu/Mon nights) that shows:

1. Live scores for every NFL game.
2. My ESPN fantasy matchup: my score vs. my opponent's, live, with each starter's points.
3. A scrolling ticker of big plays across the league, with my players flagged.
4. An alert when one of my players (or my opponent's) produces a big play.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Fantasy platform | ESPN (private league, needs `espn_s2` + `SWID` cookies) |
| League format | 12-team, half-PPR. Lineup: QB, RB, RB, WR, WR, TE, FLEX, D/ST, K |
| Live NFL data | ESPN's free, unofficial site API. No paid feed. |
| Users | Just me for now |
| Hosting | Netlify (static frontend + Netlify Functions). See assumption A1. |
| Ticker content | Player name, position, NFL team, short note describing the play |

## 3. Assumptions (confirmed by Tom, 2026-11-09)

- **A1. Hosting.** Netlify for the page and the functions.
- **A2. Ticker scope.** Show big plays from all games, with my players highlighted and my opponent's players marked differently. Add a filter toggle: All / My matchup / My team. Only starters count as "my player" or "my opponent's player": bench players get no highlight and no alert.
- **A3. Fumbles.** Show every fumble, tagged "LOST" or "recovered by own team." Make this a config flag.
- **A4. Field goals.** Show made FGs and all missed FGs, with distance. Config flag.

## 4. Big-play rules (put these in one config file, `src/shared/bigPlayRules.ts`)

| Event | Rule |
|---|---|
| Long rush | Rushing play, gain >= 25 yards |
| Long catch | Completed pass, gain >= 40 yards |
| Touchdown | Any TD (rush, pass, return, defensive) |
| Interception | Any INT. Also flag pick-sixes. |
| Fumble | See A3 |
| Field goal | See A4 |

Edge cases the detector must handle:

- One play can match several rules (a 45-yard TD catch). Emit one ticker item with multiple tags, not two items.
- A TD pass credits two players (passer and receiver). Show the receiver as the headline, passer in the note. Both count for "my player" matching.
- Plays wiped out by penalty ("No Play," "nullified," "reversed") must not appear. If a play already shown gets reversed on review, mark the ticker item "overturned" rather than silently deleting it.
- Defensive/return TDs and turnovers should check whether the defense is my D/ST.
- Dedupe by ESPN play ID so polling never shows the same play twice.
- 2-point conversions are not big plays.

## 5. Architecture

```
Browser (Vite + React + TypeScript)
   |  polls every 15s during live games, every 5 min otherwise
   v
Netlify Functions (TypeScript)
   /api/scoreboard   -> ESPN NFL scoreboard (all games this week)
   /api/plays        -> current big-play list for each in-progress game
   /api/fantasy      -> my matchup + both rosters + live points
   |
   v
ESPN site API (no auth)        ESPN fantasy API (cookies, server-side only)
```

Why functions instead of calling ESPN from the browser:
- ESPN fantasy cookies must never reach the client.
- Avoids CORS problems.
- One place to normalize ESPN's messy JSON into clean types.

Keep functions stateless. The function returns each live game's current big plays and the browser diffs that against what it has shown, so new plays, corrected plays and overturned plays all arrive the same way. Set short CDN cache headers (about 10-15s) on responses so repeat loads don't hammer ESPN.

As built in Phase 2:
- `/api/plays` covers in-progress games by default; `?events=id,id` (max 16) names games instead, so the browser can keep polling a game for a few minutes after it goes final and catch late corrections. Big-play thresholds travel as query params (`rush`, `catch`, `fumbles`, `fgMade`, `fgMissed`) from the settings panel.
- `fantasyOwner` is filled in by the browser with `src/shared/fantasyOwner.ts`, joining `/api/plays` with `/api/fantasy`, so the plays function never needs fantasy data.
- Scoreboard and plays are cached on Netlify's CDN (10s while games are live, 60s otherwise). Fantasy is `private, max-age=10` and never CDN-cached.

Build the ESPN calls behind an adapter interface (`NflDataSource`, `FantasySource`) so a paid feed or another fantasy platform (Sleeper, Yahoo) can be swapped in later without touching the UI.

## 6. Data sources

These are undocumented endpoints. Structure has changed before. Phase 0 exists to confirm the exact JSON shape before any feature code is written.

**NFL live data (no auth):**
- Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` (supports `?week=` and `?dates=`)
- Game summary with drives and plays: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={eventId}`
- Fallback for per-play player IDs if the summary lacks them: the core API, `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/plays`

**ESPN fantasy (private league, cookies required):**
- Base: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}`
- Useful views (pass as repeated `view=` params): `mTeam`, `mRoster`, `mMatchup`, `mMatchupScore`, `mBoxscore`, `mSettings`, with `scoringPeriodId={week}`
- Send cookies `espn_s2` and `SWID` (SWID includes the curly braces). **Found 2026-11-10: the league is set to public (`settings.isPublic`), and every view reads the same with no cookies.** The functions send cookies only when they're set; if the league goes private, the fantasy endpoint returns an `espn_auth` error.
- Live points: `totalPointsLive` per matchup side, `appliedStatTotal` per player. Confirmed in Phase 0, see `docs/phase0-findings.md`.

**Player ID matching:** Confirmed in Phase 0: ESPN fantasy player IDs are the NFL athlete IDs, and D/ST IDs are `-16000 - proTeamId`. The summary's plays carry no player IDs, so they come from the core API's `participants`.

## 7. Features and screens

Single page, three zones. Dark theme, readable on a laptop and a phone.

**Top: Ticker.** Horizontal scroll (or vertical feed on mobile). Each item:
`[TD] Bijan Robinson, RB, ATL: 34-yd rush TD, Q2 4:12`
- Tag chips: TD, LONG RUSH, LONG CATCH, INT, FUMBLE, FG
- Gold border if my player, red border if my opponent's player
- Click an item to expand the full ESPN play text and game score at the time

**Left: Scoreboard.** Card per game: teams, score, quarter, clock, possession, red-zone indicator. Games with my players get a badge showing how many of my starters are in that game.

**Right: My matchup.** My team vs. opponent:
- Live totals at top, with projected totals if ESPN provides them
- Starter-by-starter rows: slot, player, NFL team, game status (not started / live / final), live points
- Bench below, collapsed
- Points change animation when a player's score moves

**Alerts.** When a big play involves a player in my matchup:
- Toast in the page
- Optional browser notification (ask permission once, setting to turn off)
- Optional sound, off by default

**Settings panel.** Big-play thresholds, fumble/FG flags, poll interval. Store in localStorage (wrapped in try/catch). League ID, team ID and season are shown read-only: they come from environment variables so the browser can't point my cookies at another league. Cookies are not entered here; they live in Netlify environment variables.

## 8. Core types (`src/shared/types.ts`)

```ts
type BigPlayTag = "TD" | "LONG_RUSH" | "LONG_CATCH" | "INT" | "PICK_SIX" | "FUMBLE" | "FUMBLE_LOST" | "FG" | "FG_MISS";

interface BigPlay {
  id: string;              // ESPN play id
  gameId: string;
  tags: BigPlayTag[];
  primaryPlayer: { espnId: string; name: string; position: string; team: string } | null;
  secondaryPlayers: { espnId: string; name: string; role: string }[]; // passer, tackler, etc.
  yards: number | null;
  description: string;     // short note for ticker
  rawText: string;         // ESPN's full play text
  quarter: number;
  clock: string;
  scoreAfter: { home: number; away: number };
  status: "active" | "overturned";
  fantasyOwner: "me" | "opponent" | "other" | null;
}
```

Also define `Game`, `FantasyMatchup`, `FantasyTeam`, `RosterSlot`.

## 9. Build phases

**Phase 0: Data discovery (no UI).**
- Write a script that pulls the scoreboard, one live or finished game summary, and my fantasy league data.
- Save raw responses to `fixtures/` as JSON. Fantasy fixtures and live recordings stay out of git.
- `.env` with `ESPN_S2`, `ESPN_SWID`, `LEAGUE_ID`, `TEAM_ID`, `SEASON`, git-ignored before the first commit.
- Record one live game, because live fantasy points can only be confirmed mid-game.
- Report back: where plays live in the summary JSON, which fields give play type, yards, scoring flag, player IDs; where live fantasy points live; whether fantasy and NFL player IDs match.
- Stop and show Tom the findings before Phase 1.

**Phase 1: Big-play detector, tested offline.**
- Pure function: `detectBigPlays(summaryJson, corePlays, rules) => BigPlay[]`. The core play list supplies the players, since summary plays have no player IDs. Without it, plays are still found but carry no player.
- Unit tests against saved fixtures from at least 3 finished games. Include a game with a pick-six, a fumble, a nullified play, and a long TD catch.
- Acceptance: running it on a finished game lists every TD and every 25+ rush / 40+ catch, with zero penalty-negated plays.

**Phase 2: Functions + local dev.** Done 2026-11-10.
- Netlify Functions for the three endpoints, run with `netlify dev` (`npm run dev`, http://localhost:8888).
- Functions read the `.env` created in Phase 0.
- Built: `netlify/functions/*` (thin wrappers), `src/server/api/handlers.ts`, the `NflDataSource` / `FantasySource` adapters in `src/server/`, normalizers in `src/server/espn/`. Tests cover the normalizers against fixtures and live snapshots, and the handlers and adapters with ESPN stubbed.
- Still to check during a live game: how fast the core API names players on new plays. `npm run record:live` now saves the core play list every 30s.

**Phase 3: UI.** Done 2026-11-10.
- Scoreboard, matchup panel, ticker, alerts, settings.
- **Replay mode:** a `?replay=fixtures/<game>` URL param that feeds saved fixtures through the app with a timer, so the page can be tested on a Tuesday. Dev builds only: fixtures must not ship to the deployed site.
- As built: `src/client/` (React + Tailwind). Replay is `http://localhost:8888/?replay=fixtures/live/401873051`, with an optional `&team=<id>` to replay as another team in the league (team 20 starts the Vikings D/ST, which gets an alert in Q1). A dev-only Vite middleware (`src/dev/`) serves it; the production build was checked to contain no replay code or fixture paths.
- The browser polls `/api/fantasy` first, then the scoreboard for the same week (ESPN's default scoreboard lags a day behind fantasy on Tuesdays).
- Alerts fire only for plays first seen after a game's first fetch, so loading the page mid-game or changing a setting doesn't set off a burst.
- A play counts as "mine" if my starter is in it in any role, so an interception thrown by my QB or a fumble by my WR is flagged and alerts too. Confirmed by Tom, 2026-11-10: keep flagging these.

**Phase 4: Deploy.** Code done 2026-11-10; the deploy itself needs Tom's Netlify login (steps in `docs/deploy.md`).
- Deploy to Netlify. Cookies go in Netlify environment variables, not the repo.
- Add a simple access gate: functions require a secret key header that the page stores after a one-time prompt. Keeps strangers from burning through ESPN requests on my cookies.
- As built: `src/server/api/access.ts` checks `X-Access-Key` against `ACCESS_KEY` (constant-time, fails closed when unset outside `netlify dev`). The page shows a key prompt on any 401 and keeps the key in localStorage. `npm run access-key` creates the key on Netlify as a secret; `npm run push-env` copies the league settings (cookies only with `--with-cookies`, since the league is public).
- Production builds get a Content-Security-Policy `<meta>` tag (Vite's dev server needs inline scripts, so dev doesn't); `netlify.toml` adds `noindex`, `X-Frame-Options: DENY` and related headers.

**Phase 5 (optional, later).**
- Compute live fantasy points myself from box-score stats + league scoring settings, if ESPN's live number lags.
- Win probability for my matchup.
- Multi-user: let league members pick their team.
- Second fantasy source behind the adapter.

## 10. Testing

- Unit tests (Vitest) for the detector and the fantasy normalizer, all against fixtures.
- Record a live game: a script that saves a summary snapshot every 30s during a real game. Use those snapshots for replay mode and for testing the "since cursor" logic and the overturned-play handling.
- Manual check during a live window: compare the ticker against ESPN's own gamecast for one quarter.

## 11. Risks

- **Unofficial APIs.** ESPN can change or block endpoints without notice. The adapter layer and fixtures limit the damage. Don't poll faster than every 10-15s.
- **ESPN cookies expire.** When fantasy calls start returning 401/empty data, show a clear "refresh ESPN cookies" message instead of a blank panel.
- **Play corrections.** ESPN edits plays after the fact (yardage, penalties, reviews). The detector must re-check recent plays, not just new ones.
- **Cookie security.** `espn_s2` is a full ESPN session. Never log it, never send it to the browser, never commit it.

## 12. How Claude Code should work on this

- Stack: Vite, React, TypeScript, Tailwind, Vitest, Netlify Functions.
- Stay on TypeScript 6.0.x: netlify-cli's bundler needs TypeScript's JavaScript API, which TypeScript 7 doesn't have.
- Keep ESPN-specific parsing in `src/server/espn/`. UI code should only see the types in `src/shared/types.ts`.
- Finish and test each phase before starting the next. Stop after Phase 0 and Phase 1 for Tom to review.
- When a field's location in ESPN's JSON is uncertain, check the fixtures instead of guessing.
- Tom is on Windows 11. Scripts should work in PowerShell (use npm scripts, not bash-only commands).

## Reference links

- ESPN fantasy base URL change to lm-api-reads: https://stmorse.github.io/journal/espn-fantasy-projections.html
- ESPN fantasy cookie auth (espn_s2 + SWID), Node client: https://www.npmjs.com/package/espn-ff-api
- ESPN site vs. core API overview: https://zuplo.com/blog/2024/10/01/espn-hidden-api-guide
- ESPN NFL endpoints incl. play-by-play: https://sportsapis.dev/nfl-api
