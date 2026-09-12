# Multi-Agent Development Rules

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
6. Commit
7. 상대 Agent의 구현 코드리뷰
8. 리뷰 결과에 따른 수정
9. 재검증
10. 최종적으로 사람이 판단해야 하는 사항만 보고

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

코드리뷰 시 다음 순서로 중요도를 판단한다.

1. Correctness
2. Data Consistency
3. Concurrency Safety
4. Transaction Correctness
5. Failure Handling
6. Security
7. Performance
8. Maintainability
9. Testability
10. Code Style

개인적인 취향이나 단순한 스타일 차이는
문제가 없는 한 리뷰하지 않는다.

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

요구사항을 해결하는 데 필요한 범위를 벗어나
대규모 리팩터링을 하지 않는다.
기존 코드의 문제를 발견하더라도
현재 Issue 해결에 직접적인 영향을 주지 않는다면
임의로 수정하지 않는다.
다만 실제 장애나 데이터 손상을 유발할 수 있는 문제는
별도의 리뷰 의견으로 보고한다.

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

테스트를 통과시키기 위해
테스트의 의미를 약화하거나 부적절하게 수정하지 않는다.

## 8. Code Review

상대 Agent의 구현을 리뷰할 때
자신의 구현을 정답으로 간주하지 않는다.
상대방의 코드를 독립적으로 분석한다.
리뷰 의견은 다음 기준으로 분류한다.

**BLOCKER**
반드시 수정해야 하는 문제.
예:

- 데이터 손상
- 동시성 버그
- 트랜잭션 오류
- 보안 취약점
- 명백한 비즈니스 로직 오류
- 운영 장애 가능성이 높은 문제

**SHOULD_FIX**
현재 동작에는 문제가 없을 수 있지만
수정하는 것이 합리적인 문제.

**QUESTION**
기술적으로 어느 쪽이든 가능한 선택이며
비즈니스 또는 제품 결정이 필요한 문제.

**NIT**
단순 스타일이나 사소한 개선 사항.
NIT는 특별한 이유가 없다면
수정을 요구하지 않는다.

## 9. Review Format

리뷰 의견은 다음 형식을 사용한다.

```
[BLOCKER]
파일:
라인:
문제:
왜 문제인가:
발생 조건:
권장 해결 방향:

[SHOULD_FIX]
파일:
라인:
문제:
이유:
권장 해결 방향:

[QUESTION]
주제:
선택지:
각 선택의 Trade-off:
사람이 결정해야 하는 이유:
```

마지막에는 반드시 다음을 작성한다.

```
REVIEW RESULT:
- APPROVE
- CHANGES REQUIRED
- NEEDS HUMAN DECISION

HUMAN DECISIONS:
- 사람이 직접 판단해야 하는 내용만 작성
- 없다면 NONE
```

## 10. Design Comparison

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

## 11. Human Decision

다음과 같은 사항은 Agent가 임의로 결정하지 않는다.

- 서로 다른 합리적인 아키텍처 선택
- 비용과 안정성의 Trade-off
- 성능과 구현 복잡도의 Trade-off
- API Breaking Change
- 데이터 마이그레이션 정책
- 비즈니스 요구사항의 해석
- 인프라 구성 변경
- 외부 서비스 선택

이 경우 다음 형식으로 보고한다.

```
HUMAN DECISION REQUIRED
Question:
왜 결정이 필요한가:
Option A:
Option B:
Recommendation:
Recommendation의 근거:
```

## 12. Git

각 Agent는 자신의 작업 브랜치에서만 작업한다.
다른 Agent의 작업 브랜치를 직접 수정하지 않는다.
Commit은 의미 있는 단위로 작성한다.
Commit message는 변경 목적이 명확하게 드러나도록 작성한다.
PR에는 다음 내용을 포함한다.

- 구현 내용
- 설계 이유
- 주요 변경사항
- 테스트 결과
- 고려한 장애 상황
- 알려진 제한사항

## 13. No Fake Verification

실행하지 않은 테스트를 실행했다고 보고하지 않는다.
확인하지 않은 동작을 정상이라고 단정하지 않는다.
추측과 실제 검증 결과를 구분해서 작성한다.

## 14. Final Report

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

## 15. Core Principle

두 Agent의 목적은
서로의 코드를 무조건 수정하는 것이 아니다.
목표는 다음과 같다.
한 명의 개발자가 놓칠 수 있는 문제를
다른 개발자가 독립적인 관점에서 발견한다.
따라서 리뷰에서 중요한 것은
얼마나 많은 문제를 찾았는가가 아니라,
실제로 중요한 문제를 얼마나 정확하게 찾았는가이다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
