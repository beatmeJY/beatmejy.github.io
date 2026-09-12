# Agent별 GitHub 리뷰 신원

지금은 Cursor·Claude가 둘 다 개인 계정 `@beatmeJY`로 `gh pr comment`를 남겨 구분이 안 된다.
리뷰는 **에이전트 전용 GitHub 계정**의 PAT로만 남긴다.

| Agent | GitHub 로그인 | 이메일(참고) | 토큰 환경변수 | 토큰 파일 |
| --- | --- | --- | --- | --- |
| B (Cursor) | `beatmejy-cursor` | `beatmejy-cursor@gmail.com` | `CURSOR_AGENT_GH_TOKEN` | `~/.config/beatmejy/tokens/cursor-agent` |
| A (Claude) | `beatmejy-claude` | (해당 계정 이메일) | `CLAUDE_AGENT_GH_TOKEN` | `~/.config/beatmejy/tokens/claude-agent` |

> Contributors에 보이는 `@cursoragent` / `@claude`는 Co-authored-by용이라 PR 리뷰 신원으로 쓸 수 없다.

## 0. 초대 수락 (필수)

저장소 Collaborator 초대가 **pending**이면 코멘트가 403이 난다.

1. `beatmejy-cursor` / `beatmejy-claude`로 GitHub 로그인
2. 초대 메일 또는 https://github.com/beatmeJY/beatmejy.github.io/invitations 에서 **Accept**
3. 개인 계정으로 확인:

```bash
gh api repos/beatmeJY/beatmejy.github.io/collaborators/beatmejy-cursor -i | head -n 1
# 기대: HTTP/2 204
```

## 1. 인증 (권장: device-flow)

개인 계정과 봇 계정을 `gh`에 같이 두고, 리뷰만 봇 토큰으로 보낸다.

```bash
# Cursor 봇
gh auth login --hostname github.com --git-protocol https --web
# 브라우저에서 beatmejy-cursor로 승인

# Claude 봇
gh auth login --hostname github.com --git-protocol https --web
# 브라우저에서 beatmejy-claude로 승인

# push/PR 생성은 다시 개인 계정
gh auth switch --user beatmeJY
```

`scripts/agent-pr-comment.mjs`는 `gh auth token --user beatmejy-cursor`(또는 claude)를 읽는다.
별도 PAT 파일은 선택 사항이다.

### PAT 파일 (선택)

Fine-grained PAT를 쓰려면:

```bash
mkdir -p ~/.config/beatmejy/tokens
chmod 700 ~/.config/beatmejy/tokens
printf '%s' 'ghp_xxx_cursor' > ~/.config/beatmejy/tokens/cursor-agent
printf '%s' 'ghp_xxx_claude' > ~/.config/beatmejy/tokens/claude-agent
chmod 600 ~/.config/beatmejy/tokens/*
```

또는:

```bash
export CURSOR_AGENT_GH_TOKEN=ghp_...
export CLAUDE_AGENT_GH_TOKEN=ghp_...
```

토큰 우선순위: 환경변수 → 토큰 파일 → `gh auth token --user …`
## 2. 신원 확인

```bash
node scripts/agent-pr-comment.mjs --agent cursor --whoami
node scripts/agent-pr-comment.mjs --agent claude --whoami
```

기대: `login`이 `beatmejy-cursor` / `beatmejy-claude`.  
`beatmeJY`이면 스크립트가 거부한다.

## 3. 리뷰 남기기

```bash
node scripts/agent-pr-comment.mjs --agent cursor --pr <N> --body-file /tmp/review.md
node scripts/agent-pr-comment.mjs --agent claude --pr <N> --body-file /tmp/review.md
```

## 4. Cursor Automation

Automation은 GitHub App(`cursor[bot]`)으로 코멘트할 수 있다.
로컬 Agent B 리뷰는 `@beatmejy-cursor`를 쓴다.

## 계정 역할

| 행위 | 계정 |
| --- | --- |
| Agent B 리뷰 | `@beatmejy-cursor` |
| Agent A 리뷰 | `@beatmejy-claude` |
| 사람 의견 코멘트 / PR 머지 | `@beatmeJY` (`beatmejy@gmail.com`) |

push·사람 의견·머지 전에는 `gh auth switch --user beatmeJY`로 되돌린다.