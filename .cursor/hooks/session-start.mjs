import { runSyncOnOpen } from "./sync-on-open.mjs";
import { buildResumeContext, projectRoot } from "./lib.mjs";

// Cursor sessionStart hook. Keep stdout JSON-only.
let additional_context = "";
try {
  const { sync } = runSyncOnOpen({ event: "sessionStart", quiet: true });
  additional_context = buildResumeContext(projectRoot(), sync);
} catch (error) {
  additional_context = `[session-sync] error: ${error?.message || error}`;
  process.stderr.write(`${additional_context}\n`);
}

process.stdout.write(JSON.stringify({ additional_context }) + "\n");
