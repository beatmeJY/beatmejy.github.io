  ---
  title: "게시글 제목"
  description: "게시글에 대한 간단한 설명"
  date: "2026-08-31"
  category: "Backend"
  tags:
    - Kotlin
    - Spring Boot
  draft: true
  ---

  # 제목

  한두 문단으로 글을 시작하는 맥락을 적는다. 현장에서 겪은 문제를 **왜 다시 꺼내는지**가 드러나면 좋다. 설정 값이나 함수 이름은 `application.yml`, `findActiveUsers()`처럼 인라인 코드로 적는다.

  관련 문서: [Spring Boot 레퍼런스](https://docs.spring.io/spring-boot/docs/current/reference/html/)

  ## 문제 상황

  어떤 문제가 있었는지 작성한다.

  - 증상: 응답 시간, 에러율, 재현 조건
  - 영향 범위: API, 배치, 특정 테이블
  - 처음 발견한 로그나 지표

  재현 순서가 있으면 번호 목록을 쓴다.

  1. 요청을 보낸다
  2. 슬로우 쿼리 로그를 확인한다
  3. 같은 조건에서 재현되는지 본다

  > 장애 글이라면 “언제부터, 무엇이, 얼마나”를 한 문장으로 먼저 적는다.

  ## 원인 분석

  문제의 원인을 분석한 과정을 작성한다.

  - 가설 1
  - 가설 2
  - 실제로 맞았던 원인

  비교가 필요하면 테이블을 쓴다.

  | 가설 | 확인 방법 | 결과 |
  | --- | --- | --- |
  | 인덱스 부재 | `EXPLAIN` | type = ALL |
  | 커넥션 고갈 | 풀 메트릭 | 해당 없음 |

  진행 체크가 필요하면 체크리스트를 쓴다.

  - [x] 슬로우 쿼리 로그 확인
  - [x] 실행 계획 확인
  - [ ] 부하 테스트로 재검증

  ## 해결 방법

  어떤 방법으로 해결했는지 작성한다.

  ### 코드

  Kotlin:

  ```kotlin
  fun findActiveUsers(ids: List<Long>): List<User> {
      return userRepository.findAllById(ids)
          .filter { it.isActive }
  }
  ```

  SQL:

  ```sql
  SELECT *
  FROM users
  WHERE id = 1;
  ```

  로컬 확인:

  ```bash
  npm run build
  ```

  ### 이미지

  파일을 `public/images/`에 넣은 뒤 아래처럼 참조한다.

  ![이미지 설명](/images/example.png)

  ## 왜 이렇게 해결했는가?

  다른 방법과 비교하고 해당 방법을 선택한 이유를 작성한다.

  - 대안 A: 장점 / 단점
  - 대안 B: 장점 / 단점
  - 이번에 고른 방법: 트레이드오프

  > 정답이 아니라, **그 시점에 왜 이 선택을 했는지**를 남긴다.

  ## 결과

  성능 개선이나 장애 해결 결과를 작성한다.

  - Before / After (응답 시간, TPS, 에러율)
  - 남은 리스크나 모니터링 항목

  ## 배운 점

  이번 작업을 통해 얻은 인사이트를 작성한다.

  - 다음에 같은 증상이면 먼저 볼 곳
  - 팀 컨벤션으로 가져갈 것

  ## 참고

  - [참고 자료](https://example.com)
