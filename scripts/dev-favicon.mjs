/**
 * 로컬 dev에서 worktree별 탭 파비콘을 쓰기 위해
 * Next가 자동 주입하는 app/favicon.ico를 잠시 치우고 app/icon.* 를 심는다.
 * (favicon.ico가 있으면 link 태그보다 우선해 Cursor/Claude가 같아 보인다.)
 */
import {
  copyFileSync,
  existsSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const ICON_CANDIDATES = ["icon.png", "icon.jpeg", "icon.jpg", "icon.ico"];

/**
 * @param {string} root
 */
function iconPaths(root) {
  return ICON_CANDIDATES.map((name) => join(root, "app", name));
}

/**
 * @param {string} root
 */
export function clearDevAppIcons(root) {
  for (const path of iconPaths(root)) {
    if (existsSync(path)) unlinkSync(path);
  }
}

/**
 * @param {string} root
 * @param {'main' | 'cursor' | 'claude' | 'unknown'} agent
 */
export function installDevAppIcon(root, agent) {
  const appDir = join(root, "app");
  const favicon = join(appDir, "favicon.ico");
  const hidden = join(appDir, ".favicon.ico.dev-hidden");

  clearDevAppIcons(root);

  if (existsSync(favicon) && !existsSync(hidden)) {
    renameSync(favicon, hidden);
  }

  if (agent === "cursor") {
    copyFileSync(
      join(root, "public/images/cursor.jpeg"),
      join(appDir, "icon.jpeg"),
    );
    return "app/icon.jpeg ← public/images/cursor.jpeg";
  }

  if (agent === "claude") {
    copyFileSync(
      join(root, "public/images/claude.png"),
      join(appDir, "icon.png"),
    );
    return "app/icon.png ← public/images/claude.png";
  }

  // main / unknown: 기본 favicon 복구만
  restoreDevAppIcon(root);
  return "default favicon.ico";
}

/**
 * @param {string} root
 */
export function restoreDevAppIcon(root) {
  const appDir = join(root, "app");
  const favicon = join(appDir, "favicon.ico");
  const hidden = join(appDir, ".favicon.ico.dev-hidden");

  clearDevAppIcons(root);

  if (existsSync(hidden)) {
    if (existsSync(favicon)) unlinkSync(favicon);
    renameSync(hidden, favicon);
  }
}
