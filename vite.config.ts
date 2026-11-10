import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { replayPlugin } from "./src/dev/replayPlugin.ts";

// The page may only run its own scripts and talk to its own functions. img-src allows any https
// image because fantasy team logos can be hosted anywhere. Inline styles are React's style={...}.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/** Production builds only: the dev server's hot reload needs inline scripts. */
const contentSecurityPolicy = (): Plugin => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" },
  ],
});

export default defineConfig(({ mode }) => {
  // Server-side only: none of these reach the browser (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(),
      replayPlugin({ teamId: Number(env.TEAM_ID), leagueId: env.LEAGUE_ID ?? "" }),
    ],
    build: { outDir: "dist", emptyOutDir: true },
  };
});
