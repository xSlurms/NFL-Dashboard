import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App, type ReplayHandle } from "./App.tsx";
import { liveSource, type ClientSource } from "./api.ts";
import "./index.css";

async function start() {
  const root = createRoot(document.getElementById("root")!);
  let source: ClientSource = liveSource;
  let replay: ReplayHandle | undefined;
  let replayProblem: ReactNode = null;

  // Replay mode: ?replay=fixtures/live/<gameId>[&team=<fantasy team ID>]. The whole branch, and the
  // modules it imports, are dropped from production builds because import.meta.env.DEV is false there.
  const params = new URLSearchParams(location.search);
  const replayDir = params.get("replay");
  if (import.meta.env.DEV && replayDir) {
    try {
      const [{ createReplay }, { ReplayBar }] = await Promise.all([import("./replaySource.ts"), import("./components/ReplayBar.tsx")]);
      const { source: replaySource, clock, meta } = await createReplay(replayDir, params.get("team"));
      source = replaySource;
      replay = { clock, bar: <ReplayBar clock={clock} meta={meta} /> };
    } catch (error) {
      replayProblem = `Replay failed: ${(error as Error).message}`;
    }
  }

  root.render(
    <StrictMode>
      <App source={source} replay={replay} notice={replayProblem} />
    </StrictMode>,
  );
}

void start();
