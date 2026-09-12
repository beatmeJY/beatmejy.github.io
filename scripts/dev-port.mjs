import { createServer } from "node:net";
import { basename } from "node:path";

/**
 * worktree 디렉터리명 → 기본 포트.
 * Cursor / Claude / main 원본이 동시에 `npm run dev`해도 기본값이 겹치지 않게 한다.
 */
export const WORKTREE_PORTS = Object.freeze({
  "beatmejy.github.io": 3000,
  "beatmejy-cursor": 3001,
  "beatmejy-claude": 3002,
});

const PORT_SCAN_LIMIT = 100;

/**
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function preferredPort(cwd, env = process.env) {
  const fromEnv = env.PORT?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid PORT: ${fromEnv}`);
    }
    return n;
  }

  const name = basename(cwd);
  return WORKTREE_PORTS[name] ?? 3000;
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
 * @param {{ isFree?: (port: number) => Promise<boolean> }} [options]
 * @returns {Promise<{ preferred: number, port: number, redirected: boolean }>}
 */
export async function resolveDevPort(cwd, env = process.env, options = {}) {
  const preferred = preferredPort(cwd, env);
  const port = await findAvailablePort(preferred, options);
  return {
    preferred,
    port,
    redirected: port !== preferred,
  };
}
