import { accessPolicyFromEnv, guard } from "../../src/server/api/access.ts";
import { handleFantasy } from "../../src/server/api/handlers.ts";
import { EspnFantasySource, fantasyConfigFromEnv } from "../../src/server/espn/espnFantasySource.ts";

// Built per request so new values in the environment (e.g. refreshed cookies) take effect without a restart.
export default (req: Request) =>
  guard(req, accessPolicyFromEnv(process.env), () =>
    handleFantasy(req, () => new EspnFantasySource(fantasyConfigFromEnv(process.env))),
  );

export const config = { path: "/api/fantasy" };
