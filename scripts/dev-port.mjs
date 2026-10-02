import { createServer } from "node:net";

/** PORT 환경변수가 없을 때 쓰는 기본 포트 */
export const DEFAULT_PORT = 3000;

const PORT_SCAN_LIMIT = 100;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function preferredPort(env = process.env) {
  const fromEnv = env.PORT?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid PORT: ${fromEnv}`);
    }
    return n;
  }

  return DEFAULT_PORT;
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
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ isFree?: (port: number) => Promise<boolean> }} [options]
 * @returns {Promise<{ preferred: number, port: number, redirected: boolean }>}
 */
export async function resolveDevPort(env = process.env, options = {}) {
  const preferred = preferredPort(env);
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
