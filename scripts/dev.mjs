#!/usr/bin/env node
/**
 * 멀티 worktree에서 `next dev` 포트 충돌을 피한다.
 * - 브랜치/worktree별 기본 포트
 * - 점유·EADDRINUSE면 다음 포트로 재시도 (check-then-act 레이스 보완)
 * - PORT 환경변수로 강제 지정 가능
 * - Cursor/Claude 탭 파비콘용 app/icon.* 설치·종료 시 원복
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installDevAppIcon, restoreDevAppIcon } from "./dev-favicon.mjs";
import { nextPortAfter, resolveDevAgent, resolveDevPort } from "./dev-port.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const MAX_BIND_ATTEMPTS = 20;

/**
 * @param {string} text
 */
function looksLikeAddrInUse(text) {
  return /EADDRINUSE|address already in use/i.test(text);
}

/**
 * next를 띄우고, 정상 종료/시그널까지 기다린다.
 * 포트 충돌로 바로 죽으면 eaddrinuse: true.
 * @param {number} port
 * @param {string} agent
 * @returns {Promise<{ eaddrinuse: boolean, code: number | null, signal: NodeJS.Signals | null }>}
 */
function runNextDev(port, agent) {
  return new Promise((resolvePromise) => {
    let stderr = "";
    const child = spawn(
      process.execPath,
      [nextBin, "dev", "--port", String(port)],
      {
        cwd: root,
        stdio: ["inherit", "inherit", "pipe"],
        env: {
          ...process.env,
          PORT: String(port),
          // layout이 탭 제목 접두사를 worktree별로 고를 때 사용
          DEV_AGENT: agent,
        },
      },
    );

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    const forward = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    const onSigInt = () => forward("SIGINT");
    const onSigTerm = () => forward("SIGTERM");
    process.on("SIGINT", onSigInt);
    process.on("SIGTERM", onSigTerm);

    child.on("exit", (code, signal) => {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
      resolvePromise({
        eaddrinuse: Boolean(code) && looksLikeAddrInUse(stderr),
        code,
        signal,
      });
    });
  });
}

async function main() {
  if (!existsSync(nextBin)) {
    console.error(
      "[dev] next가 없습니다. 먼저 `npm install`을 실행하세요.",
    );
    process.exit(1);
  }

  const agent = resolveDevAgent(root);
  const iconNote = installDevAppIcon(root, agent);
  const restore = () => {
    try {
      restoreDevAppIcon(root);
    } catch (err) {
      console.error(
        "[dev] favicon restore failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };
  process.on("exit", restore);
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restore();
    process.exit(143);
  });

  let { preferred, port, redirected } = await resolveDevPort(root);
  if (redirected) {
    console.log(
      `[dev] port ${preferred} is in use — trying ${port}`,
    );
  }

  console.log(`[dev] worktree agent: ${agent}`);
  console.log(`[dev] tab icon: ${iconNote}`);

  for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS; attempt += 1) {
    console.log(`[dev] using port ${port} (attempt ${attempt}/${MAX_BIND_ATTEMPTS})`);
    console.log(`[dev] http://localhost:${port}`);

    const result = await runNextDev(port, agent);
    if (result.signal) {
      restore();
      process.kill(process.pid, result.signal);
      return;
    }
    if (!result.eaddrinuse) {
      restore();
      process.exit(result.code ?? 1);
    }

    const next = await nextPortAfter(port);
    console.log(
      `[dev] EADDRINUSE on ${port} (race or busy) — retrying on ${next}`,
    );
    port = next;
  }

  restore();
  console.error(
    `[dev] failed to bind after ${MAX_BIND_ATTEMPTS} attempts. Set PORT explicitly.`,
  );
  process.exit(1);
}

main().catch((err) => {
  try {
    restoreDevAppIcon(root);
  } catch {
    // ignore
  }
  console.error("[dev]", err instanceof Error ? err.message : err);
  process.exit(1);
});
