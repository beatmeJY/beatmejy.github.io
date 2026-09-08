---
updated: 2026-09-08
open:
  - path: .cursor/hooks/lib.mjs
    note: readStdin/git fetch hang으로 workspaceOpen이 안 끝나는 문제 수정
  - path: .cursor/hooks/workspace-open.mjs
    note: last-sync.json 미생성·에이전트 브리핑 누락과 함께 점검
---

# 이어서 할 일

이 파일은 PC를 바꿔도 작업을 이어가기 위한 인수인계 메모입니다.
`코딩종료` 때 에이전트가 갱신하고, 프로젝트/에이전트 세션을 열면 여기의 `open` 파일을 엽니다.

## 다음에 할 일

- `workspaceOpen` / `sessionStart` 훅이 종료되지 않는 원인 수정 (`readStdin` EOF 대기, `git fetch` 인증/네트워크)
- 훅 정상 종료 후 `.cursor/last-sync.json` 생성·에이전트 `additional_context` 브리핑이 되는지 확인
- 세션 시작 시 에이전트가 `CONTINUE.md`를 읽고 한두 문장 안내하는지 점검

## 작성 중 (WIP)

- 없음. 게시글 WIP 없음.

## 오늘 한 일

- (다른 Mac) git 작성자 이메일 맞춤, auto-pull + CONTINUE 인수인계 워크플로 추가, gh 인증·sync 커밋 푸시
- (이 Mac) 자동 pull·작업 브리핑 미동작 조사 — 훅 hang, `last-sync.json` 미생성, CONTINUE `open` 비어 있음 확인
- `blog-commit-date.mdc` 규칙 파일 추가
