import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  continuePath,
  loadContinue,
  projectRoot,
  syncFromRemote,
  writeSyncState,
} from "./lib.mjs";

function out(quiet, message) {
  if (quiet) {
    process.stderr.write(`${message}\n`);
  } else {
    process.stdout.write(`${message}\n`);
  }
}

function printSection(quiet, title, body) {
  out(quiet, `\n=== ${title} ===`);
  out(quiet, body.trimEnd());
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `## ${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`,
  );
  const match = markdown.match(pattern);
  return match ? match[1].trim() : "(없음)";
}

function openInEditorDetached(root, relativePaths) {
  const abs = relativePaths
    .map((p) => resolve(root, p))
    .filter((p) => existsSync(p));
  if (abs.length === 0) return { attempted: [], ok: false };

  const bin = process.platform === "win32" ? "cursor.cmd" : "cursor";
  try {
    const child = spawn(bin, ["-r", ...abs], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    child.unref();
    return { attempted: abs, ok: true };
  } catch {
    return { attempted: abs, ok: false };
  }
}

export function runSyncOnOpen({
  event = "sync-on-open",
  openContinue = true,
  quiet = false,
} = {}) {
  const root = projectRoot();
  out(quiet, `[sync] project: ${root}`);
  out(quiet, "[sync] fetching origin...");

  const sync = syncFromRemote(root);
  const cont = loadContinue(root);

  const toOpen = [];
  if (openContinue) toOpen.push("CONTINUE.md");
  for (const item of cont.open) {
    if (!toOpen.includes(item.path)) toOpen.push(item.path);
  }

  const opened = openInEditorDetached(root, toOpen);

  writeSyncState(root, {
    event,
    sync,
    open: cont.open,
    opened: opened.attempted,
    openOk: opened.ok,
  });

  printSection(
    quiet,
    "Git sync",
    [
      `result: ${sync.ok ? "OK" : "FAIL"} (${sync.action})`,
      sync.message,
      sync.head ? `HEAD: ${sync.head} (${sync.branch})` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (cont.markdown) {
    printSection(
      quiet,
      "다음에 할 일",
      extractSection(cont.markdown, "다음에 할 일"),
    );
    printSection(
      quiet,
      "작성 중 (WIP)",
      extractSection(cont.markdown, "작성 중 (WIP)"),
    );
    printSection(
      quiet,
      "오늘 한 일",
      extractSection(cont.markdown, "오늘 한 일"),
    );
  } else {
    printSection(quiet, "CONTINUE.md", "파일 없음");
  }

  if (cont.open.length > 0) {
    printSection(
      quiet,
      "이어서 열 파일",
      cont.open
        .map((item) => `- ${item.path}${item.note ? ` — ${item.note}` : ""}`)
        .join("\n"),
    );
  } else {
    printSection(
      quiet,
      "이어서 열 파일",
      "없음 (open: []) — CONTINUE.md만 엽니다",
    );
  }

  out(quiet, `\n[sync] done. CONTINUE.md → ${continuePath(root)}`);

  return { sync, cont, opened };
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  try {
    runSyncOnOpen({ event: "folderOpen-task", quiet: false });
    process.exit(0);
  } catch (error) {
    process.stderr.write(`[sync] fatal: ${error?.message || error}\n`);
    process.exit(1);
  }
}
