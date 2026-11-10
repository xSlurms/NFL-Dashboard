# Deploying to Netlify

Run these in PowerShell from the project folder. Steps 1 and 2 are one-time.

**1. Log in and create the site.** Opens a browser to sign in to Netlify, then creates an empty site linked to this folder. Pick any free name; it becomes `<name>.netlify.app`.

```powershell
npx netlify login
npx netlify sites:create --name <pick-a-name>
```

**2. Set the environment variables.**

```powershell
npm run push-env
npm run access-key
```

- `push-env` copies `LEAGUE_ID`, `TEAM_ID` and `SEASON` from `.env`. The ESPN cookies are not copied: the league is public, so the site doesn't need them. If the league ever goes private, run `npm run push-env -- --with-cookies` (they're stored as write-only secrets), then redeploy.
- `access-key` creates a random key, stores it on Netlify as a secret, and prints it once. Save it in your password manager.

**3. Deploy.** Builds the page and functions and publishes them.

```powershell
npm run deploy
```

Open the URL it prints, enter the access key once on each device, and the page remembers it.

## Later

- **Redeploy** after code changes: `npm run deploy`.
- **New access key** (e.g. a device was lost): `npm run access-key`, then `npm run deploy`. Every device asks for the new key. Settings has "Forget the access key on this device".
- **Fantasy panel says "ESPN refused"**: the league has gone private or the cookies expired. Copy fresh `espn_s2` and `SWID` cookies into `.env`, run `npm run push-env -- --with-cookies`, then `npm run deploy`.

## What's protected

- Every function requires the `X-Access-Key` header. Without `ACCESS_KEY` set, a deployed function refuses all requests (it's open only under `netlify dev`).
- The CDN keys cached scoreboard and plays responses on the access key, so nobody gets a cached answer without it. Fantasy responses are never CDN-cached.
- The page carries a strict Content-Security-Policy (own scripts only, API calls only to its own functions), `noindex`, and can't be framed.
- Fixtures, replay mode and `.env` are not part of the deploy: the page is `dist/` from `vite build`, and the functions bundle only the code they import.
