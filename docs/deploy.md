# Deploying to Netlify

Run these in PowerShell from the project folder. Steps 1 and 2 are one-time.

**1. Log in and create the site.** Opens a browser to sign in to Netlify, then creates an empty site linked to this folder. Pick any free name; it becomes `<name>.netlify.app`.

```powershell
npx netlify login
npx netlify sites:create --name <pick-a-name>
```

**2. Create the access key.** The only setting the site needs.

```powershell
npm run access-key
```

It creates a random key, stores it on Netlify as a secret, and prints it once. Save it in your password manager.

The site has no default team and no ESPN cookies of its own: each person adds their teams in the page with "+ Add team" (saved in their browser), and a private league carries its own cookies. Don't put `LEAGUE_ID`, `TEAM_ID`, `ESPN_S2` or `ESPN_SWID` on Netlify; the functions ignore them.

**3. Deploy.** Builds the page and functions and publishes them.

```powershell
npm run deploy
```

Open the URL it prints, enter the access key once on each device, and the page remembers it.

## Later

- **Redeploy** after code changes: `npm run deploy`.
- **New access key** (e.g. a device was lost): `npm run access-key`, then `npm run deploy`. Every device asks for the new key. Settings has "Forget the access key on this device".
- **Fantasy panel says "ESPN refused"**: the league is private or its cookies expired. Press "Edit this team", turn on Private league and paste fresh `espn_s2` and `SWID` values (the "?" next to each says where to find them).

## What's protected

- Every function requires the `X-Access-Key` header. Without `ACCESS_KEY` set, a deployed function refuses all requests (it's open only under `netlify dev`).
- The CDN keys cached scoreboard and plays responses on the access key, so nobody gets a cached answer without it. Fantasy responses are never CDN-cached.
- The page carries a strict Content-Security-Policy (own scripts only, API calls only to its own functions), `noindex`, and can't be framed.
- Fixtures, replay mode and `.env` are not part of the deploy: the page is `dist/` from `vite build`, and the functions bundle only the code they import.

## Sharing it

Everyone you give the access key to uses the same key, adds their own teams, and keeps any private-league cookies in their own browser. Their cookies pass through your functions (never stored or logged), so share it only with people who trust you. To cut everyone off, make a new key.

Rough usage per open, visible page during games: the scores and plays every 15 seconds (cached and shared between viewers for 10 seconds), and the fantasy matchup every 15 seconds only while one of that matchup's games is on, otherwise every 5 minutes. That's about 11,000 requests a week for someone who watches every game. A hidden tab (another tab in front, or a minimized window) refreshes once a minute if notifications or sound are on, and not at all otherwise; it catches up the moment it's shown. Check the Usage page in Netlify after a busy Sunday: deploys and function run time use credits too.
