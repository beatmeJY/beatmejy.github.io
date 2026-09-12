# Git worktree 작업 공간

에이전트별로 병렬 작업할 때 쓰는 레이아웃입니다.

```text
/Users/youl/Projects/
├── beatmejy.github.io/   # 원본, branch: main
├── beatmejy-cursor/      # Cursor 전용, branch: feature/cursor-work
└── beatmejy-claude/      # Claude 전용, branch: feature/claude-work
```

## 규칙

- **Cursor**는 `beatmejy-cursor` (`feature/cursor-work`)에서만 커밋한다.
- **Claude**는 `beatmejy-claude` (`feature/claude-work`)에서만 커밋한다.
- `beatmejy.github.io`의 `main`은 통합·배포용. 여기서 직접 기능 작업하지 않는다.
- 작업 시작 시 각자 worktree에서 `git fetch` 후 `main`을 fast-forward merge(또는 rebase)해 맞춘다.
- 끝나면 feature → `main` PR 또는 `main`에서 merge 후 push.

## 로컬 dev 포트

두 worktree에서 동시에 `npm run dev`하면 기본 3000이 충돌한다. `scripts/dev.mjs`가 디렉터리명으로 기본 포트를 나누고, 점유 시 다음 빈 포트로 넘긴다.

| worktree | 기본 포트 |
| --- | --- |
| `beatmejy.github.io` | 3000 |
| `beatmejy-cursor` | 3001 |
| `beatmejy-claude` | 3002 |

포트 선택 로직 검증: `npm run test:dev-port`

## 다시 만들기

```bash
cd /Users/youl/Projects/beatmejy.github.io
git fetch origin
git worktree add ../beatmejy-cursor -b feature/cursor-work
git worktree add ../beatmejy-claude -b feature/claude-work
```

이미 브랜치가 있으면:

```bash
git worktree add ../beatmejy-cursor feature/cursor-work
git worktree add ../beatmejy-claude feature/claude-work
```
