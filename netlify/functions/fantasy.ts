import { accessPolicyFromEnv, guard } from "../../src/server/api/access.ts";
import { handleFantasy } from "../../src/server/api/handlers.ts";
import { EspnFantasySource, fantasyConfig } from "../../src/server/espn/espnFantasySource.ts";

// Built per request from the team (and a private league's cookies) the page sends.
export default (req: Request) =>
  guard(req, accessPolicyFromEnv(process.env), () =>
    handleFantasy(req, (query, headers) => new EspnFantasySource(fantasyConfig(query, headers))),
  );

export const config = { path: "/api/fantasy" };
