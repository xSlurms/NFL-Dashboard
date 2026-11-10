# Phase 0 findings (2026-11-09)

Sources: 14 finished Week 9 games (`fixtures/nfl/`), the full league pull (`fixtures/fantasy/`, git-ignored), and a live recording of BUF @ MIN, Monday night (`fixtures/live/401873051/`, git-ignored, gzipped: 707 summaries, 358 scoreboards, 358 fantasy snapshots).

## NFL game summary (`/summary?event={id}`)

| Need | Where |
|---|---|
| Plays | `drives.previous[].plays[]`, plus `drives.current.plays[]` while live |
| Play type | `type.text` (e.g. `Rush`, `Pass Reception`, `Passing Touchdown`, `Pass Interception Return`, `Field Goal Missed`) |
| Scoring | `scoringPlay`; `awayScore` / `homeScore` on every play |
| Time | `period.number`, `clock.displayValue`, `wallclock` |
| Flags | `isPenalty`, `isTurnover`, `statYardage` |
| Player names | `boxscore.players[].statistics[].athletes[].athlete` (id, displayName) |
| **Player IDs on plays** | **Not present on any play (0 of 2,607).** |

### Rules the detector must follow
- **Don't trust `type.text` alone.** A pick-six came through as `Fumble Recovery (Own)` with text "Jaden Dugger 35 Yd Interception Return". Use `scoringPlay` and the text too.
- **Don't trust `statYardage` when a penalty is involved.** It includes penalty yards (a 14-yard run with holding = -19). Parse "for N yards" / "no gain" from the text.
- **Reversals edit the play in place.** Text becomes `<original>...the play was REVERSED.<corrected>`, and `type` changes to the final ruling. Only the part after `REVERSED.` counts.
- **Penalty-negated plays** contain "No Play" (164 of them), and a wiped-out TD reads "TOUCHDOWN NULLIFIED by Penalty" with type `Penalty`.
- **2-point tries** are in the TD play's text, not separate plays.

## Core API plays (`sports.core.api.espn.com/.../competitions/{id}/plays?limit=400`)
- One page holds a whole game (167 plays). Play IDs match the summary's IDs (166 of 166).
- `participants[]` have `type` (passer, receiver, rusher, scorer, fumbler, recoverer, kicker, returner, tackler...) and `athlete.$ref` ending in the athlete ID.
- **Untested:** how quickly the core API reflects plays during a live game. The live recording only captured the summary.
- Interceptions have no "interceptor" role: the intercepting player is `passDefender` and `returner`.
- After a reversal, participants describe the final ruling. An overturned play's original scorer or recoverer may be missing, so its headline player can be the wrong one (seen on DET's overturned fumble-return TD).
- Position IDs used: 1 WR, 7 TE, 8 QB, 9 RB, 10 FB, 22 K, 23 P, 29 CB, 30 LB, 31 DE, 32 DT, 35 DB, 36 S, plus linemen.

## Live behavior (BUF @ MIN recording)
- **Play IDs are stable.** 187 IDs, none disappeared.
- **Plays are edited after they first appear:** 43 of 187, up to ~10 min later (tacklers added, yards ±1, kicker names fixed, extra-point text appended to TDs).
- **Reviews change the same ID:** an incompletion became a fumble recovery 3 min later, and a sack-fumble lost became a plain sack 2 min later. So the "overturned" status comes from re-evaluating each known ID on every poll.
- **Delay:** plays show up a median 57s (p90 77s, max 193s) after their `wallclock`.
- **Scoreboard while live:** `competitions[0].situation` has `down`, `distance`, `downDistanceText`, `possessionText`, `isRedZone`, timeouts and `lastPlay`. `situation.possession` (a team ID) was present in 291 of 348 in-game snapshots: missing between possessions, so keep the last known value.

## ESPN fantasy
| Need | Where |
|---|---|
| My matchup | `schedule[]` where `matchupPeriodId` = week and `home.teamId` or `away.teamId` = 4 |
| Live total | `home/away.totalPointsLive` (equals the sum of starters). `totalPoints` stays 0 until the week is final. |
| Projected total | `totalProjectedPointsLive` = live points + remaining projections, updated every minute as the game clock runs |
| Win probability | `home/away.winProbability` |
| Roster | `rosterForCurrentScoringPeriod.entries[]`: `lineupSlotId`, `playerId`, `playerPoolEntry.appliedStatTotal`, `playerPoolEntry.player` (fullName, proTeamId, defaultPositionId, injuryStatus) |
| Per-player stats | `player.stats[]`: `statSourceId` 0 = actual, 1 = projection; `externalId` = NFL game ID |
| Slots | QB 0, RB 2, WR 4, TE 6, D/ST 16, K 17, bench 20, IR 21, FLEX 23 |

- **Player IDs match the NFL athlete IDs** (23 of 23 checked; names and teams match too). `proTeamId` = NFL team ID.
- **D/ST** IDs are `-16000 - proTeamId` (Lions D/ST = -16008, team 8).
- **Fantasy points don't lag.** Aaron Jones Sr.'s points moved in the same snapshot as the play that changed them.
- **Yards appear to score in whole 10-yard chunks:** 16 rushing yards counted as 1.0 point. Check `settings.scoringSettings` before computing points ourselves (Phase 5).
- **Payload size:** the full league pull is 21 MB. For polling, request only `view=mMatchupScore&view=mBoxscore` with header `x-fantasy-filter: {"schedule":{"filterMatchupPeriodIds":{"value":[week]}}}` (1.2 MB, same live fields). See `getLiveFantasy` in `scripts/lib.ts`.
- `members[]` holds every league member's name and SWID: never send it to the browser.

### Added in Phase 2 (2026-11-10)
- **The league is public** (`settings.isPublic: true`). The live views return byte-identical data with good cookies, bogus cookies or none, so the cookies are optional while it stays public.
- **Current week:** `?view=mStatus` (1.2 KB, no cookies needed) gives `scoringPeriodId` and `status.currentMatchupPeriod`. ESPN moved to week 10 by Tuesday morning, while the NFL scoreboard's default still showed week 9.
- The live views (`mMatchupScore` + `mBoxscore`) also carry `teams[]` (name, abbrev, logo) and per-player `stats[]`, where `statSourceId: 1` for the current `scoringPeriodId` is the week's projection.
- The starters' `appliedStatTotal` values add up to `totalPointsLive` in all 158 polling snapshots from Monday night.
