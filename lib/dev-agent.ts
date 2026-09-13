import type { Metadata } from "next";
import { basename } from "node:path";

export type DevAgent = "main" | "cursor" | "claude" | "unknown";

const WORKTREE_AGENTS: Record<string, DevAgent> = {
  "beatmejy.github.io": "main",
  "beatmejy-cursor": "cursor",
  "beatmejy-claude": "claude",
};

/**
 * `npm run dev`(scripts/dev.mjs)가 넣는 DEV_AGENT를 우선하고,
 * 없으면 cwd 폴더명으로 추론한다. production 빌드에서는 쓰지 않는다.
 */
export function resolveRuntimeDevAgent(): DevAgent | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const fromEnv = process.env.DEV_AGENT?.trim();
  if (fromEnv === "main" || fromEnv === "cursor" || fromEnv === "claude") {
    return fromEnv;
  }

  const dir = basename(process.cwd());
  return WORKTREE_AGENTS[dir] ?? null;
}

export type DevTabConfig = {
  agent: "cursor" | "claude";
  label: string;
  iconHref: string;
  iconType: string;
  title: Metadata["title"];
};

/** 브라우저 탭 구분용 설정. main/production이면 null. */
export function getDevTabConfig(siteName: string): DevTabConfig | null {
  const agent = resolveRuntimeDevAgent();
  if (agent !== "cursor" && agent !== "claude") {
    return null;
  }

  if (agent === "cursor") {
    return {
      agent,
      label: "Cursor",
      iconHref: "/images/cursor.jpeg",
      iconType: "image/jpeg",
      // 접두사를 앞에 둬서 탭에서 바로 보이게 한다
      title: {
        default: `[Cursor] ${siteName}`,
        template: `[Cursor] %s · ${siteName}`,
      },
    };
  }

  return {
    agent,
    label: "Claude",
    iconHref: "/images/claude.png",
    iconType: "image/png",
    title: {
      default: `[Claude] ${siteName}`,
      template: `[Claude] %s · ${siteName}`,
    },
  };
}
