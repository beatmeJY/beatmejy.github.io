#!/usr/bin/env node
/**
 * Agent별 GitHub 신원으로 PR 코멘트를 남긴다.
 * 개인 계정(beatmeJY)으로는 절대 폴백하지 않는다 — 토큰 없으면 실패한다.
 *
 * 사용:
 *   node scripts/agent-pr-comment.mjs --agent cursor --pr 17 --body-file review.md
 *   node scripts/agent-pr-comment.mjs --agent claude --pr 16 --body-file review.md
 *   node scripts/agent-pr-comment.mjs --agent cursor --whoami
 *
 * 토큰 (우선순위):
 *   1) 환경변수 CURSOR_AGENT_GH_TOKEN / CLAUDE_AGENT_GH_TOKEN
 *   2) ~/.config/beatmejy/tokens/cursor-agent 또는 claude-agent (파일 한 줄)
 *   3) `gh auth token --user <expectedLogin>` (device-flow 다중 계정)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "beatmeJY/beatmejy.github.io";
const PERSONAL_LOGINS = new Set(["beatmeJY"]);

/** 기대하는 봇 로그인 — whoami/게시 시 불일치하면 실패한다. */
const EXPECTED_LOGINS = {
  cursor: "beatmejy-cursor",
  claude: "beatmejy-claude",
};

const AGENTS = {
  cursor: {
    role: "Agent B (Cursor)",
    envKey: "CURSOR_AGENT_GH_TOKEN",
    tokenFile: join(homedir(), ".config", "beatmejy", "tokens", "cursor-agent"),
    marker: "<!-- agent-b-review -->",
    expectedLogin: EXPECTED_LOGINS.cursor,
  },
  claude: {
    role: "Agent A (Claude)",
    envKey: "CLAUDE_AGENT_GH_TOKEN",
    tokenFile: join(homedir(), ".config", "beatmejy", "tokens", "claude-agent"),
    marker: "<!-- agent-a-review -->",
    expectedLogin: EXPECTED_LOGINS.claude,
  },
};

function usage(exitCode = 1) {
  console.error(`Usage:
  node scripts/agent-pr-comment.mjs --agent <cursor|claude> --pr <N> --body-file <path>
  node scripts/agent-pr-comment.mjs --agent <cursor|claude> --whoami
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = { agent: null, pr: null, bodyFile: null, whoami: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--agent") out.agent = argv[++i];
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--body-file") out.bodyFile = argv[++i];
    else if (a === "--whoami") out.whoami = true;
    else if (a === "-h" || a === "--help") usage(0);
    else {
      console.error(`Unknown arg: ${a}`);
      usage(1);
    }
  }
  return out;
}

function loadToken(agentKey) {
  const cfg = AGENTS[agentKey];
  const fromEnv = process.env[cfg.envKey]?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(cfg.tokenFile)) {
    const t = readFileSync(cfg.tokenFile, "utf8").trim();
    if (t) return t;
  }
  // gh 다중 계정 device-flow 로그인 토큰
  const fromGh = spawnSync(
    "gh",
    ["auth", "token", "--user", cfg.expectedLogin],
    { encoding: "utf8" },
  );
  if (fromGh.status === 0) {
    const t = (fromGh.stdout || "").trim();
    if (t) return t;
  }
  return null;
}

function tokenEnv(token) {
  return {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
    GH_HOST: "github.com",
  };
}

function ghJson(token, args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: tokenEnv(token),
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || `gh failed (${result.status})`).trim(),
    );
  }
  const text = (result.stdout || "").trim();
  return text ? JSON.parse(text) : null;
}

function ensureMarker(body, marker) {
  if (body.includes(marker)) return body;
  return `${marker}\n${body}`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.agent || !AGENTS[args.agent]) {
    console.error("--agent must be cursor or claude");
    usage(1);
  }

  const cfg = AGENTS[args.agent];
  const token = loadToken(args.agent);
  if (!token) {
    console.error(
      `[agent-pr-comment] ${cfg.role} GitHub 토큰이 없습니다.\n` +
        `  export ${cfg.envKey}=ghp_...\n` +
        `  또는 파일: ${cfg.tokenFile}\n` +
        `설정: docs/AGENT-GITHUB-IDENTITIES.md`,
    );
    process.exit(2);
  }

  const me = ghJson(token, ["api", "user", "--jq", "{login,id}"]);
  if (args.whoami) {
    console.log(JSON.stringify({ agent: args.agent, role: cfg.role, ...me }, null, 2));
    return;
  }

  if (!args.pr || !args.bodyFile) usage(1);
  if (!existsSync(args.bodyFile)) {
    console.error(`body file not found: ${args.bodyFile}`);
    process.exit(1);
  }

  if (PERSONAL_LOGINS.has(me.login)) {
    console.error(
      `[agent-pr-comment] 토큰 주인이 @${me.login}(개인)입니다. ${cfg.role} 전용 봇 계정의 PAT를 쓰세요.`,
    );
    process.exit(3);
  }

  if (me.login !== cfg.expectedLogin) {
    console.error(
      `[agent-pr-comment] 토큰 주인이 @${me.login}입니다. 기대값은 @${cfg.expectedLogin} (${cfg.role}).`,
    );
    process.exit(3);
  }

  const body = ensureMarker(readFileSync(args.bodyFile, "utf8"), cfg.marker);
  const tmp = join(tmpdir(), `agent-pr-comment-${args.agent}-${args.pr}.md`);
  writeFileSync(tmp, body, "utf8");

  try {
    const result = spawnSync(
      "gh",
      ["pr", "comment", String(args.pr), "--repo", REPO, "--body-file", tmp],
      { encoding: "utf8", env: tokenEnv(token) },
    );
    if (result.status !== 0) {
      console.error((result.stderr || result.stdout || "gh pr comment failed").trim());
      process.exit(result.status ?? 1);
    }
    console.log(
      `[agent-pr-comment] posted as @${me.login} (${cfg.role}) on PR #${args.pr}`,
    );
    if (result.stdout?.trim()) console.log(result.stdout.trim());
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

try {
  main();
} catch (err) {
  console.error("[agent-pr-comment]", err instanceof Error ? err.message : err);
  process.exit(1);
}
