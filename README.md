# beatmeJY Tech blog

Kotlin / Spring Boot 중심의 백엔드 기술 블로그입니다. Next.js 정적보내기로 빌드하고 GitHub Pages(`https://beatmeJY.github.io`)에 배포합니다.

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

에이전트별 병렬 작업(Cursor / Claude)은 git worktree를 쓴다. → [`WORKTREES.md`](./WORKTREES.md)

PR 코드리뷰는 개인 계정이 아니라 Cursor/Claude 전용 GitHub 계정으로 남긴다. → [`docs/AGENT-GITHUB-IDENTITIES.md`](./docs/AGENT-GITHUB-IDENTITIES.md)
