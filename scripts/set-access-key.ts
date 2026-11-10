// Creates a new random access key and stores it in the linked Netlify site's environment as a secret.
// Usage (after `netlify login` and `netlify link`): npm run access-key
// Prints the key once so you can save it in a password manager. Redeploy afterwards so the functions pick it up.
// Running it again replaces the key; every device then has to enter the new one.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const key = randomBytes(24).toString("base64url"); // 32 characters

const result = spawnSync(
  process.execPath,
  ["node_modules/netlify-cli/bin/run.js", "env:set", "ACCESS_KEY", key, "--secret", "--context", "production", "deploy-preview", "branch-deploy", "--scope", "functions", "--force"],
  // Hide the CLI's own output: it can echo the value it set.
  { stdio: ["inherit", "ignore", "inherit"] },
);

if (result.status !== 0) {
  console.error("\nCouldn't set ACCESS_KEY. Run `npx netlify login` and `npx netlify link` first, then try again.");
  process.exit(1);
}

console.log("ACCESS_KEY is set on Netlify (functions only, as a secret).\n");
console.log(`  ${key}\n`);
console.log("Save it in your password manager now; Netlify won't show it again.");
console.log("Then redeploy (npm run deploy) and enter the key once on each device.");
