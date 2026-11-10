// Vite dev-server middleware for replay mode: /__replay/{meta,scoreboard,plays,fantasy}?dir=...&t=...
// `apply: "serve"` keeps it out of `vite build`, so neither it nor the fixtures can ship.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { rulesFromQuery } from "../server/api/handlers.ts";
import { ReplayError, openRecording, replayFantasy, replayMeta, replayPlays, replayScoreboard } from "./replay.ts";

export interface ReplayConfig {
  teamId: number;
  leagueId: string;
}

export function replayPlugin(config: ReplayConfig): Plugin {
  return {
    name: "football-replay",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__replay", (req, res) => respond(req, res, config));
    },
  };
}

function respond(req: IncomingMessage, res: ServerResponse, config: ReplayConfig) {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rec = openRecording(url.searchParams.get("dir") ?? "");
    const t = Number(url.searchParams.get("t") ?? rec.start);
    if (!Number.isFinite(t)) throw new ReplayError(400, "t must be a time in ms");
    switch (url.pathname) {
      case "/meta":
        return send(200, replayMeta(rec));
      case "/scoreboard":
        return send(200, replayScoreboard(rec, t));
      case "/plays": {
        const events = (url.searchParams.get("events") ?? rec.gameId).split(",").filter((id) => /^\d{1,12}$/.test(id));
        return send(200, replayPlays(rec, t, events, rulesFromQuery(url)));
      }
      case "/fantasy": {
        // ?team= replays the recording as another team in the league, e.g. to see alerts fire.
        const teamId = Number(url.searchParams.get("team") || config.teamId);
        if (!Number.isInteger(teamId) || teamId <= 0) throw new ReplayError(500, "TEAM_ID is not set in .env");
        return send(200, replayFantasy(rec, t, teamId, config.leagueId));
      }
      default:
        throw new ReplayError(404, "Unknown replay endpoint");
    }
  } catch (error) {
    const status = error instanceof ReplayError ? error.status : 500;
    send(status, { error: { code: status === 400 ? "bad_request" : "upstream", message: (error as Error).message } });
  }
}
