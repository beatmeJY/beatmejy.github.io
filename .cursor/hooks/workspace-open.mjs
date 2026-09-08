import {
  buildResumeContext,
  loadContinue,
  openFilesInCursor,
  projectRoot,
  readStdin,
  syncFromRemote,
  writeSyncState,
} from "./lib.mjs";

// Consume stdin JSON from Cursor (workspaceOpen payload).
readStdin();

const root = projectRoot();
const sync = syncFromRemote(root);
const cont = loadContinue(root);
const openPaths = cont.open.map((item) => item.path);
const opened = openFilesInCursor(root, openPaths);

writeSyncState(root, {
  event: "workspaceOpen",
  sync,
  open: cont.open,
  opened: opened.opened,
  openFailed: opened.failed,
});

// workspaceOpen only supports pluginPaths; side effects above are the real work.
process.stdout.write("{}\n");
