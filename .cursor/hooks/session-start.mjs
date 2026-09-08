import {
  buildResumeContext,
  loadContinue,
  openFilesInCursor,
  projectRoot,
  readStdin,
  syncFromRemote,
  writeSyncState,
} from "./lib.mjs";

readStdin();

const root = projectRoot();
const sync = syncFromRemote(root);
const cont = loadContinue(root);
const opened = openFilesInCursor(
  root,
  cont.open.map((item) => item.path),
);

writeSyncState(root, {
  event: "sessionStart",
  sync,
  open: cont.open,
  opened: opened.opened,
  openFailed: opened.failed,
});

const additional_context = buildResumeContext(root, sync);
process.stdout.write(JSON.stringify({ additional_context }) + "\n");
