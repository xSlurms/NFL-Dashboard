import { accessPolicyFromEnv, guard } from "../../src/server/api/access.ts";
import { handleOdds } from "../../src/server/api/handlers.ts";
import { EspnNflSource } from "../../src/server/espn/espnNflSource.ts";

const nfl = new EspnNflSource();

export default (req: Request) => guard(req, accessPolicyFromEnv(process.env), () => handleOdds(req, nfl));

export const config = { path: "/api/odds" };
