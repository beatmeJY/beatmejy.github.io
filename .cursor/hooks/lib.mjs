import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function projectRoot(fallbackCwd = process.cwd()) {
  return process.env.CURSOR_PROJECT_DIR || fallbackCwd;
}

export function continuePath(root) {
  return join(root, "CONTINUE.md");
}

export function syncStatePath(root) {
  return join(root, ".cursor", "last-sync.json");
}

/** Parse `open:` entries from CONTINUE.md YAML frontmatter. */
export function parseContinueOpen(markdown) {
  if (!markdown) return [];
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];

  const open = [];
  const lines = match[1].split(/\r?\n/);
  let inOpen = false;
  let current = null;

  for (const line of lines) {
    if (/^open:\s*$/.test(line)) {
      inOpen = true;
      continue;
    }
    if (inOpen && /^[a-zA-Z_][\w-]*:/.test(line) && !/^\s/.test(line)) {
      inOpen = false;
      if (current?.path) open.push(current);
      current = null;
      continue;
    }
    if (!inOpen) continue;

    const item = line.match(/^\s*-\s+path:\s*(.+)\s*$/);
    if (item) {
      if (current?.path) open.push(current);
      current = { path: item[1].replace(/^["']|["']$/g, "").trim(), note: "" };
      continue;
    }
    const note = line.match(/^\s+note:\s*(.+)\s*$/);
    if (note && current) {
      current.note = note[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  if (current?.path) open.push(current);
  return open;
}

export function git(root, args, timeoutMs = 60000) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  }).trim();
}

export function syncFromRemote(root) {
  const result = {
    ok: false,
    action: "none",
    message: "",
    branch: "",
    head: "",
  };

  try {
    result.branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = git(root, ["status", "--porcelain"]);
    git(root, ["fetch", "--prune", "origin"]);

    let behind = "0";
    try {
      behind = git(root, ["rev-list", "--count", "HEAD..@{upstream}"]);
    } catch {
      result.message = "upstream 없음 — fetch만 수행";
      result.ok = true;
      result.action = "fetch-only";
      result.head = git(root, ["rev-parse", "--short", "HEAD"]);
      return result;
    }

    if (behind === "0") {
      result.ok = true;
      result.action = "already-up-to-date";
      result.message = "이미 최신입니다";
      result.head = git(root, ["rev-parse", "--short", "HEAD"]);
      return result;
    }

    if (status) {
      result.ok = false;
      result.action = "skipped-dirty";
      result.message = `원격에 ${behind}개 커밋이 있지만 로컬 변경이 있어 pull을 건너뜀`;
      result.head = git(root, ["rev-parse", "--short", "HEAD"]);
      return result;
    }

    git(root, ["pull", "--ff-only"]);
    result.ok = true;
    result.action = "pulled";
    result.message = `원격 ${behind}개 커밋을 fast-forward로 반영`;
    result.head = git(root, ["rev-parse", "--short", "HEAD"]);
    return result;
  } catch (error) {
    result.ok = false;
    result.action = "error";
    result.message = error.stderr?.toString?.() || error.message || String(error);
    try {
      result.head = git(root, ["rev-parse", "--short", "HEAD"]);
    } catch {
      /* ignore */
    }
    return result;
  }
}

export function writeSyncState(root, payload) {
  const dir = join(root, ".cursor");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    syncStatePath(root),
    JSON.stringify({ ...payload, at: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export function openFilesInCursor(root, relativePaths) {
  const opened = [];
  const failed = [];
  const abs = relativePaths
    .map((p) => resolve(root, p))
    .filter((p) => existsSync(p));

  if (abs.length === 0) return { opened, failed };

  const candidates = ["cursor", "cursor.cmd"];
  for (const bin of candidates) {
    const run = spawnSync(bin, ["-r", ...abs], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "ignore",
    });
    if (run.status === 0) {
      return { opened: abs, failed };
    }
  }

  for (const file of abs) {
    failed.push(file);
  }
  return { opened, failed };
}

export function loadContinue(root) {
  const path = continuePath(root);
  if (!existsSync(path)) {
    return { path, markdown: "", open: [] };
  }
  const markdown = readFileSync(path, "utf8");
  return { path, markdown, open: parseContinueOpen(markdown) };
}

export function buildResumeContext(root, sync) {
  const cont = loadContinue(root);
  const lines = [
    "[session-sync]",
    `git: ${sync.action} — ${sync.message}`,
    sync.head ? `HEAD: ${sync.head} (${sync.branch})` : null,
  ].filter(Boolean);

  if (cont.open.length === 0) {
    lines.push("CONTINUE.md에 이어서 열 파일이 없습니다.");
  } else {
    lines.push("이어서 작업할 파일 (CONTINUE.md):");
    for (const item of cont.open) {
      lines.push(`- ${item.path}${item.note ? ` — ${item.note}` : ""}`);
    }
    lines.push(
      "첫 응답 전에 위 파일을 Read로 열고, 사용자에게 이어서 할 일을 한 줄로 안내하세요.",
    );
  }
  return lines.join("\n");
}
