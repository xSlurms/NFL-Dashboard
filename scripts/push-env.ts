// Copies the league settings from .env to the linked Netlify site.
// Usage: npm run push-env                  LEAGUE_ID, TEAM_ID, SEASON
//        npm run push-env -- --with-cookies  also ESPN_S2 and ESPN_SWID, as secrets (only needed if the league goes private)
// Values are passed straight to the Netlify CLI and never printed.
import { spawnSync } from "node:child_process";
import { readEnv } from "./lib.ts";

const env = readEnv();
const withCookies = process.argv.includes("--with-cookies");
const plain = ["LEAGUE_ID", "TEAM_ID", "SEASON"];
const secret = withCookies ? ["ESPN_S2", "ESPN_SWID"] : [];

const missing = [...plain, ...secret].filter((name) => !env[name]?.trim());
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

function set(name: string, isSecret: boolean): boolean {
  const args = ["node_modules/netlify-cli/bin/run.js", "env:set", name, env[name]!.trim(), "--force"];
  if (isSecret) args.push("--secret", "--context", "production", "deploy-preview", "branch-deploy", "--scope", "functions");
  const result = spawnSync(process.execPath, args, { stdio: ["inherit", "ignore", "inherit"] });
  console.log(`${result.status === 0 ? "set " : "FAILED"} ${name}${isSecret ? " (secret)" : ""}`);
  return result.status === 0;
}

const ok = [...plain.map((n) => set(n, false)), ...secret.map((n) => set(n, true))].every(Boolean);
if (!ok) {
  console.error("\nSome values weren't set. Run `npx netlify login` and `npx netlify link` first.");
  process.exit(1);
}
console.log(withCookies ? "\nDone." : "\nDone. ESPN cookies were not copied: the league is public, so the site doesn't need them.");
