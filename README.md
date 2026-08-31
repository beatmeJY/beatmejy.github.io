# beatmeJY Tech blog

Kotlin / Spring Boot 중심의 백엔드 기술 블로그입니다. Next.js 정적보내기로 빌드하고 GitHub Pages(`https://beatmeJY.github.io`)에 배포합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인합니다.

정적보내기 결과는 `npm run build` 후 `npm run preview`로 확인합니다. `output: "export"`라서 `npm start`(`next start`)는 사용할 수 없습니다.

## 게시글 작성

`content/posts/`에 Markdown 파일을 추가합니다. 파일 이름이 URL slug가 됩니다.

```md
---
title: "MySQL 인덱스 최적화"
description: "EXPLAIN을 이용한 쿼리 분석과 인덱스 최적화"
date: "2026-08-31"
tags:
  - MySQL
  - Database
category: "Database"
---

본문...
```

- `category`는 `Backend`, `Database`, `Infrastructure`, `DevOps`, `Architecture`, `etc` 중 하나입니다.
- 이미지는 `public/images/`에 넣고 `/images/파일명`으로 참조합니다.

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
