// Vite dev-server middleware for replay mode: /__replay/{meta,scoreboard,plays,fantasy}?dir=...&t=...
// `apply: "serve"` keeps it out of `vite build`, so neither it nor the fixtures can ship.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { rulesFromQuery } from "../server/api/handlers.ts";
import { ReplayError, openRecording, replayFantasy, replayMeta, replayOdds, replayPlays, replayScoreboard } from "./replay.ts";

export function replayPlugin(): Plugin {
  return {
    name: "football-replay",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__replay", (req, res) => respond(req, res));
    },
  };
}

function respond(req: IncomingMessage, res: ServerResponse) {
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
      case "/odds":
        return send(200, replayOdds(rec, t));
      case "/plays": {
        const events = (url.searchParams.get("events") ?? rec.gameId).split(",").filter((id) => /^\d{1,12}$/.test(id));
        return send(200, replayPlays(rec, t, events, rulesFromQuery(url)));
      }
      case "/fantasy": {
        // The selected tab's team, or ?team= from the page address. No default, as on the live site.
        const raw = url.searchParams.get("team");
        if (!raw) throw new ReplayError(404, "No team chosen yet. Add a team (or add &team=<id> to the address).", "no_team");
        const teamId = Number(raw);
        if (!Number.isInteger(teamId) || teamId <= 0) throw new ReplayError(400, "team must be a fantasy team number");
        return send(200, replayFantasy(rec, t, teamId));
      }
      default:
        throw new ReplayError(404, "Unknown replay endpoint");
    }
  } catch (error) {
    const status = error instanceof ReplayError ? error.status : 500;
    const code = error instanceof ReplayError && error.code ? error.code : status === 400 ? "bad_request" : "upstream";
    send(status, { error: { code, message: (error as Error).message } });
  }
}
