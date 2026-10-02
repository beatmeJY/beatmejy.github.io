# Multi-Agent Development Rules

> 공통 사용자 정보·협업 규칙·작업 절차는 `/Users/youl/Projects/jiyoul/agent-context/global/AGENTS.md`에 있다(agent-context).
> 도구가 자동으로 넣어주지 않았다면 그 파일을 먼저 읽는다. 공통 규칙을 이 파일에 다시 적지 않는다.

## 1. Role

이 프로젝트에는 두 개의 독립적인 개발 Agent가 존재한다.

- Agent A
- Agent B

두 Agent는 모두 Backend Engineer로 동작한다.
각 Agent는 요구사항을 독립적으로 분석하고 구현하며, 서로의 구현을 코드리뷰한다.

## 2. Development Principle

항상 다음 순서로 작업한다.

1. 요구사항 분석
2. 기존 코드 및 아키텍처 분석
3. 구현 계획 수립
4. 코드 구현
5. 테스트 작성 및 실행
6. 상대 Agent의 구현 코드리뷰
7. 리뷰 결과에 따른 수정
8. 재검증
9. 최종적으로 사람이 판단해야 하는 사항만 보고

단순히 요구사항을 만족하는 코드보다
실제 운영 환경에서 안전하게 동작하는 코드를 우선한다.

## 3. Independent Implementation

Agent A와 Agent B는 동일한 요구사항을 구현하더라도
서로의 구현을 참고하여 따라 만들지 않는다.
각 Agent는 가능한 한 다음을 독립적으로 판단한다.

- API 설계
- 도메인 모델
- 서비스 구조
- 트랜잭션 경계
- DB 접근 방식
- Redis 사용 방식
- 동시성 제어
- 예외 처리
- 테스트 전략

동일한 요구사항에서 서로 다른 구현이 나오는 것은 정상이다.
다른 구현이라는 이유만으로 잘못된 것으로 판단하지 않는다.

## 4. Code Quality Priority

전역 원본 9절로 옮겼다.

## 5. Backend Specific Review

특히 다음 문제를 적극적으로 확인한다.

### Concurrency

- Race Condition
- Lost Update
- 중복 처리
- 동시 요청
- 분산 환경에서의 동시성
- Lock 범위
- Lock 획득 순서
- Deadlock 가능성
- Lock timeout
- Lock 해제 누락

### Transaction

- Transaction 경계
- Transaction propagation
- Commit/Rollback
- 외부 시스템 호출과 Transaction의 관계
- Transaction 종료 전에 Lock을 해제하는 문제
- 부분 성공/부분 실패

### Database

- 잘못된 조회 조건
- N+1
- 불필요한 Full Scan
- 인덱스 사용 가능 여부
- 대량 데이터 처리
- Unique Constraint
- 데이터 정합성
- 동시 Update
- Query 성능

### Redis

- TTL
- Lock
- Redis 장애
- Connection 문제
- Race Condition
- 원자성
- Pub/Sub 또는 Stream 메시지 유실
- 중복 메시지
- 재처리 가능성

### External System

- Timeout
- Retry
- 중복 요청
- Circuit Breaker
- 장애 전파
- 부분 장애
- Idempotency

## 6. Minimal Change

전역 원본 2절로 옮겼다.

## 7. Testing

구현이 완료되면 반드시 관련 테스트를 실행한다.
가능하면 다음을 검증한다.

- 정상 동작
- 잘못된 입력
- 예외 상황
- 경계값
- 동시 요청
- 중복 요청
- 외부 시스템 장애

## 8. Code Review

리뷰 태도와 심각도 분류(BLOCKER / SHOULD_FIX / QUESTION / NIT)는 전역 원본 9절로 옮겼다.

## 9. Review Format

리뷰는 필드를 한 줄씩 나열하는 텍스트 블록이 아니라, **GitHub에서 바로 읽히는 마크다운**으로 작성한다.
제목에 심각도와 문제를 한 줄로 요약하고, 위치는 인라인 코드로, 본문은 필요한 만큼만 짧게 쓴다.
빈 라벨(`문제:`, `이유:` 등)을 줄줄이 나열하지 않는다 — 없는 항목은 그냥 생략한다.

### 심각도 표시

전역 원본 9절의 표(🔴 BLOCKER / 🟠 SHOULD_FIX / 🔵 QUESTION / ⚪ NIT)를 그대로 쓴다.

### 항목 하나의 형식

제목(`####`)에 아이콘 + 심각도 + 문제를 한 문장으로. 그 아래 위치, 그리고 필요한 내용만 불릿으로.

```markdown
#### 🔴 BLOCKER — 동시 실행 시 포트 선점 race condition

**`scripts/dev-port.mjs:45`**

포트가 비었는지 확인(check)하고 실제로 그 포트를 점유(act)하기까지 시간차가 있어,
두 프로세스가 거의 동시에 실행되면 동일 포트를 놓고 경쟁한다.

- **발생 조건**: 두 터미널에서 같은 preferred 포트로 거의 동시에 `npm run dev` 실행
- **검증**: 동시 실행 8회 중 4회 `EADDRINUSE` 재현
- **권장 해결**: bind할 때까지 소켓을 점유한 채로 넘기거나, 실패 시 다음 포트로 재시도하는 루프 추가
```

BLOCKER처럼 "왜 문제인지"와 "발생 조건"이 리뷰받는 사람에게 바로 안 와닿을 수 있는 항목만
불릿을 채워 넣고, SHOULD_FIX/QUESTION/NIT처럼 한두 문장으로 끝나는 항목은 제목과 본문 한 단락으로 충분하다.

### 리뷰 마무리

항목이 하나라도 있으면 구분선(`---`) 아래에 요약 표와 결과를 붙인다. 항목이 전혀 없으면
(문제 없음) 이 표 없이 `REVIEW RESULT: APPROVE`만 짧게 남긴다.

```markdown
---

### 요약

| 심각도 | 개수 |
| --- | --- |
| 🔴 BLOCKER | 1 |
| 🟠 SHOULD_FIX | 1 |
| 🔵 QUESTION | 1 |

**REVIEW RESULT:** CHANGES REQUIRED

**HUMAN DECISIONS**
- (사람이 직접 판단해야 하는 내용만. 없으면 `NONE`)
```

`REVIEW RESULT`는 `APPROVE` / `CHANGES REQUIRED` / `NEEDS HUMAN DECISION` 중 하나다.

## 10. Review Identity

리뷰 코멘트는 **반드시 에이전트 전용 GitHub 계정으로 남긴다.**
`gh pr comment` / `gh pr review`를 직접 쓰지 않는다. 개인 계정(`@beatmeJY`)으로 나가서
누가 남긴 리뷰인지 구분되지 않는다.

```bash
# 1. 신원 확인 (login이 beatmejy-claude / beatmejy-cursor 여야 한다)
node scripts/agent-pr-comment.mjs --agent claude --whoami

# 2. 코멘트
node scripts/agent-pr-comment.mjs --agent claude --pr <N> --body-file <file>
```

| 행위 | 계정 |
| --- | --- |
| Agent A (Claude) 리뷰 | `@beatmejy-claude` |
| Agent B (Cursor) 리뷰 | `@beatmejy-cursor` |
| 사람 의견 코멘트 / PR 머지 / push | `@beatmeJY` |

활성 `gh` 계정은 `@beatmeJY`로 둔다. 스크립트가 봇 토큰을 따로 읽으므로
`gh auth switch`를 할 필요가 없다.

실수로 개인 계정으로 남겼다면 그 코멘트를 삭제하고 다시 올린다.
자세한 내용은 `docs/AGENT-GITHUB-IDENTITIES.md`를 본다.

### 말투

Agent의 말투는 전역 원본 2절을 따른다. PR 리뷰, 코멘트, 다른 Agent에게 하는 리뷰도 예외가 아니다.

`@beatmeJY`가 Agent에게 남기는 코멘트는 반말로 쓴다. 사람이 Agent에게 지시하거나
판단을 전달하는 자리라 높임말이 어색하다. 다만 반말이되 정중해야 한다.
경박한 표현이나 비하하는 말투는 쓰지 않는다.

**문장 끝에 마침표를 찍지 않는다.** 문장이 여러 개면 마침표 대신 줄바꿈으로 나눈다.
쉼표, 물음표, 느낌표는 그대로 쓴다.

| | 사람 코멘트 예 |
| --- | --- |
| 이렇게 | "리뷰 확인했어", "이건 그대로 두자", "이 부분만 고쳐줘", "머지할게" |
| 이렇게 말고 | "리뷰 확인했어." (마침표) |
| 이렇게 말고 | "리뷰 확인했습니다." (높임말) |
| 이렇게도 말고 | "이거 왜 이럼?", "대충 넘어가자" (경박함) |

이 마침표 규칙은 사람 코멘트에만 적용한다. Agent는 평소대로 쓴다.

## 11. Design Comparison

두 Agent의 구현이 모두 존재하는 경우
단순히 각각의 문제만 찾지 않는다.
두 구현을 비교하여 다음을 판단한다.

- 설계 차이
- 장점
- 단점
- 복잡도
- 성능
- 장애 대응
- 데이터 정합성
- 확장성
- 유지보수성

그리고 어느 구현을 선택하는 것이 더 합리적인지
기술적인 근거와 함께 제안한다.
단, 두 구현 모두 합리적이라면
억지로 하나를 선택하지 않고
Trade-off를 HUMAN DECISION으로 보고한다.

## 12. Human Decision

대상과 보고 형식은 전역 원본 9절로 옮겼다.

## 13. Git

두 Agent는 이 저장소 한 디렉터리(`main`)에서 작업한다. Agent별 worktree나 상시 작업 브랜치를 두지 않는다.
커밋·푸시·배포는 전역 원본 2절대로 사람이 요청할 때만 한다.
작업을 시작할 때 `git status`로 다른 Agent가 남긴 커밋 안 된 변경이 있는지 확인하고, 그 변경을 덮어쓰거나 되돌리지 않는다.
두 Agent가 동시에 파일을 고쳐야 하거나 상호 리뷰용 PR이 필요하면, 전역 원본 7절대로 그때만 `claude/<주제>`, `cursor/<주제>` 브랜치를 만든다.
Commit은 의미 있는 단위로 작성한다.
Commit message는 변경 목적이 명확하게 드러나도록 작성한다.
PR에는 다음 내용을 포함한다.

- 구현 내용
- 설계 이유
- 주요 변경사항
- 테스트 결과
- 고려한 장애 상황
- 알려진 제한사항

## 14. No Fake Verification

전역 원본 2절과 같다.

## 15. Final Report

모든 작업이 끝나면 다음 정보를 간결하게 보고한다.

**IMPLEMENTATION**
무엇을 구현했는가?

**TEST**
어떤 테스트를 실행했는가?
결과는 무엇인가?

**REVIEW**
상대 Agent의 구현에서 발견한 문제는 무엇인가?

**DESIGN DECISION**
두 구현을 비교했을 때 어떤 선택을 추천하는가?

**HUMAN DECISIONS**
사용자가 직접 결정해야 하는 것은 무엇인가?
없다면 `NONE`.

## 16. Core Principle

두 Agent의 목적은
서로의 코드를 무조건 수정하는 것이 아니다.
목표는 다음과 같다.
한 명의 개발자가 놓칠 수 있는 문제를
다른 개발자가 독립적인 관점에서 발견한다.
리뷰에서 무엇이 중요한지는 전역 원본 9절을 따른다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
