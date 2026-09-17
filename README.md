# beatmeJY Tech blog

백엔드 개발자 [최지율](https://beatmeJY.github.io/about/)의 기술 블로그입니다.  
운영 중 겪은 장애·정합성·성능 문제를 원인부터 남은 위험까지 글로 남깁니다.

- 사이트: [https://beatmeJY.github.io](https://beatmeJY.github.io)
- 포트폴리오: [https://beatmeJY.github.io/about/](https://beatmeJY.github.io/about/)

Next.js 정적보내기로 빌드하고 GitHub Pages에 배포합니다.

---

## 이 저장소에서 실험하는 것

글만 올리는 블로그가 아니라, **두 개의 코딩 에이전트를 독립 개발자로 두고 운용하는 실험**이기도 합니다.

Cursor와 Claude에게 같은 요구를 주고, 서로의 코드를 보지 않은 채 각자 구현하게 한 뒤 상호 코드리뷰를 돌립니다. AI가 만든 코드를 그대로 받지 않고, 리뷰·머지·제품 판단은 사람이 닫습니다.

토이 프로젝트입니다. 목적은 생산성 자랑이 아니라, AI 출력을 검수 가능한 개발 프로세스로 만드는 쪽입니다.

```text
요구사항
   ├── Agent A (Claude)  →  feature/claude-work 에서 독립 구현
   └── Agent B (Cursor)  →  feature/cursor-work 에서 독립 구현
                ↓
         서로 코드리뷰 (전용 GitHub 계정)
                ↓
         사람이 판단 · 머지 · 배포
```

| 역할 | 브랜치 | 리뷰 계정 |
| --- | --- | --- |
| Agent A | `feature/claude-work` | `@beatmejy-claude` |
| Agent B | `feature/cursor-work` | `@beatmejy-cursor` |
| 사람 (지율) | `main` 머지·배포 | `@beatmeJY` |

에이전트는 git worktree로 작업 공간을 나눕니다. 같은 디렉터리에서 동시에 고치지 않습니다.

리뷰는 스타일보다 **정합성, 동시성, 트랜잭션, 장애 처리**를 먼저 봅니다. 두 구현이 모두 합리적이면 하나를 억지로 고르지 않고 사람에게 넘깁니다.

규칙 전문은 [`AGENTS.md`](./AGENTS.md), worktree 레이아웃은 [`WORKTREES.md`](./WORKTREES.md), 리뷰 계정은 [`docs/AGENT-GITHUB-IDENTITIES.md`](./docs/AGENT-GITHUB-IDENTITIES.md)에 있습니다.

---

## 로컬 실행

```bash
npm install
npm run dev
```

`npm run dev`는 **브랜치**로 기본 포트를 정하고(폴더명은 보조), 점유/`EADDRINUSE`면 다음 빈 포트로 재시도합니다.

| 브랜치 / 디렉터리 | 기본 포트 |
| --- | --- |
| `main` / `beatmejy.github.io` | 3000 |
| `feature/cursor-work` / `beatmejy-cursor` | 3001 |
| `feature/claude-work` / `beatmejy-claude` | 3002 |
| 그 외 | 3100부터 |

시작 시 터미널에 실제 URL이 출력됩니다. `PORT=4010 npm run dev`로 강제할 수 있습니다.

정적보내기 결과는 `npm run build` 후 `npm run preview`로 확인합니다. `output: "export"`라서 `npm start`(`next start`)는 사용할 수 없습니다.

## 게시글 작성

`content/posts/_template.md`를 복사해 `content/posts/my-new-post.md`로 저장합니다. 파일 이름이 URL slug가 됩니다.

- `category`는 `Backend`, `Database`, `Infrastructure`, `DevOps`, `Architecture`, `Retrospective`, `etc` 중 하나입니다.
- 이미지는 `public/images/`에 넣고 `/images/파일명`으로 참조합니다.
- `_`로 시작하는 파일(`_template.md`)은 게시글로 취급하지 않습니다.
- `draft: true`인 글은 목록·상세에 나오지 않습니다. 공개할 때 `draft: false`로 바꿉니다.
- 메인(홈) **인기 글** 순서는 frontmatter `popularRank`(숫자, **클수록 위**)로 지정합니다. 새 인기 글은 기존보다 큰 숫자만 주면 됩니다. `/posts`는 계속 최신순입니다.

## 빌드

```bash
npm run build
```

정적 파일은 `out/`에 생성됩니다. GitHub Pages가 `_next` 폴더를 무시하지 않도록 `out/.nojekyll`도 함께 만듭니다.

## GitHub Pages

1. GitHub 저장소 이름을 **`beatmeJY.github.io`** 로 둡니다. 유저 사이트 주소는 `https://beatmeJY.github.io`입니다.
2. Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
3. `main`에 푸시하면 `.github/workflows/deploy.yml`이 `out/`을 배포합니다.

사이트 URL은 `lib/site.ts`의 `siteConfig.url`에서 바꿉니다.
