import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { replayPlugin } from "./src/dev/replayPlugin.ts";

export default defineConfig(({ mode }) => {
  // Server-side only: none of these reach the browser (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), replayPlugin({ teamId: Number(env.TEAM_ID), leagueId: env.LEAGUE_ID ?? "" })],
    build: { outDir: "dist", emptyOutDir: true },
  };
});
