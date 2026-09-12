import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { basename } from "node:path";

/**
 * 브랜치 → 기본 포트 (폴더명보다 우선).
 * worktree 디렉터리 이름이 달라도 같은 feature 브랜치면 포트가 갈라진다.
 */
export const BRANCH_PORTS = Object.freeze({
  main: 3000,
  "feature/cursor-work": 3001,
  "feature/claude-work": 3002,
});

/**
 * 디렉터리명 → 기본 포트 (브랜치 매핑이 없을 때).
 */
export const WORKTREE_PORTS = Object.freeze({
  "beatmejy.github.io": 3000,
  "beatmejy-cursor": 3001,
  "beatmejy-claude": 3002,
});

/** 알 수 없는 clone/worktree — main(3000)과 겹치지 않게 시작 */
export const UNKNOWN_FALLBACK_PORT = 3100;

const PORT_SCAN_LIMIT = 100;

/**
 * @param {string} cwd
 * @returns {string | null}
 */
export function readGitBranch(cwd) {
  const result = spawnSync(
    "git",
    ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const branch = (result.stdout || "").trim();
  if (!branch || branch === "HEAD") return null;
  return branch;
}

/**
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ branch?: string | null }} [options]
 * @returns {number}
 */
export function preferredPort(cwd, env = process.env, options = {}) {
  const fromEnv = env.PORT?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid PORT: ${fromEnv}`);
    }
    return n;
  }

  const branch =
    options.branch !== undefined ? options.branch : readGitBranch(cwd);
  if (branch && Object.hasOwn(BRANCH_PORTS, branch)) {
    return BRANCH_PORTS[branch];
  }

  const name = basename(cwd);
  if (Object.hasOwn(WORKTREE_PORTS, name)) {
    return WORKTREE_PORTS[name];
  }

  return UNKNOWN_FALLBACK_PORT;
}

/**
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<boolean>}
 */
export function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close((err) => resolve(!err));
    });
  });
}

/**
 * start부터 사용 가능한 TCP 포트를 찾는다.
 * 주의: check-then-act 레이스가 있다. 실제 기동은 spawn 실패 시 재시도가 필요하다.
 * @param {number} start
 * @param {{ isFree?: (port: number) => Promise<boolean>, limit?: number }} [options]
 * @returns {Promise<number>}
 */
export async function findAvailablePort(start, options = {}) {
  const isFree = options.isFree ?? isPortFree;
  const limit = options.limit ?? PORT_SCAN_LIMIT;

  if (!Number.isInteger(start) || start < 1 || start > 65535) {
    throw new Error(`Invalid start port: ${start}`);
  }

  const end = Math.min(start + limit - 1, 65535);
  for (let port = start; port <= end; port += 1) {
    if (await isFree(port)) return port;
  }

  throw new Error(
    `No free port found in range ${start}–${end}. Set PORT to an open port.`,
  );
}

/**
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ isFree?: (port: number) => Promise<boolean>, branch?: string | null }} [options]
 * @returns {Promise<{ preferred: number, port: number, redirected: boolean }>}
 */
export async function resolveDevPort(cwd, env = process.env, options = {}) {
  const preferred = preferredPort(cwd, env, { branch: options.branch });
  const port = await findAvailablePort(preferred, options);
  return {
    preferred,
    port,
    redirected: port !== preferred,
  };
}

/**
 * EADDRINUSE 등으로 실패했을 때 다음 후보 포트.
 * @param {number} failedPort
 * @param {{ isFree?: (port: number) => Promise<boolean>, limit?: number }} [options]
 */
export async function nextPortAfter(failedPort, options = {}) {
  return findAvailablePort(failedPort + 1, options);
}
