#!/usr/bin/env node
/**
 * 멀티 worktree에서 `next dev` 포트 충돌을 피한다.
 * - worktree별 기본 포트(cursor=3001, claude=3002, main=3000)
 * - 기본 포트가 점유면 다음 빈 포트로 자동 이동
 * - PORT 환경변수로 강제 지정 가능
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDevPort } from "./dev-port.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

async function main() {
  if (!existsSync(nextBin)) {
    console.error(
      "[dev] next가 없습니다. 먼저 `npm install`을 실행하세요.",
    );
    process.exit(1);
  }

  const { preferred, port, redirected } = await resolveDevPort(root);

  if (redirected) {
    console.log(
      `[dev] port ${preferred} is in use — falling back to ${port}`,
    );
  } else {
    console.log(`[dev] using port ${port}`);
  }
  console.log(`[dev] http://localhost:${port}`);

  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", String(port)],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: String(port),
      },
    },
  );

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error("[dev]", err instanceof Error ? err.message : err);
  process.exit(1);
});
