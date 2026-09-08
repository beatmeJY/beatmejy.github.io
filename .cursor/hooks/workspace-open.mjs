import { runSyncOnOpen } from "./sync-on-open.mjs";

// Cursor workspaceOpen hook. Keep stdout JSON-only; logs go to stderr via quiet mode.
try {
  runSyncOnOpen({ event: "workspaceOpen", quiet: true });
} catch (error) {
  process.stderr.write(`[workspaceOpen] ${error?.message || error}\n`);
}
process.stdout.write("{}\n");
