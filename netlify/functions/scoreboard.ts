import { handleScoreboard } from "../../src/server/api/handlers.ts";
import { EspnNflSource } from "../../src/server/espn/espnNflSource.ts";

const nfl = new EspnNflSource();

export default (req: Request) => handleScoreboard(req, nfl);

export const config = { path: "/api/scoreboard" };
