---
title: "개발 블로그를 시작하며"
description: "Jiyoul의 개발 블로그를 시작합니다."
date: "2026-08-30"
tags:
  - Blog
  - Dev
category: "etc"
draft: true
---

안녕하세요.

백엔드 개발자로 일하면서 경험했던 문제와 해결 과정을 기록하기 위해
개인 기술 블로그를 만들었습니다.

앞으로 다음과 같은 내용을 기록할 예정입니다.

- Kotlin
- Spring Boot
- MySQL / PostgreSQL
- Redis
- AWS
- WMS
- 장애 대응
- 성능 개선
- 동시성
- 시스템 설계

> 단순히 기술을 정리하는 것이 아니라, **어떤 문제가 있었고, 왜 그렇게 해결했는지**를 중심으로 기록하려고 합니다.

링크 예: [Next.js 문서](https://nextjs.org/docs)

코드 블록 스타일을 확인하기 위한 예시입니다. 구문 강조는 다음 단계에서 결정합니다.

```kotlin
fun findActiveUsers(ids: List<Long>): List<User> {
    return userRepository.findAllById(ids)
        .filter { it.isActive }
}
```

이미지 파일은 `public/images/`에 두고 Markdown에서 `/images/파일명`으로 참조합니다.
