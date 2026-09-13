"use client";

import { useEffect, useRef, useState } from "react";
import type { TocItem } from "@/lib/markdown";

type TableOfContentsProps = {
  items: TocItem[];
};

/**
 * 글 목차. 두 가지 형태로 같은 activeId 상태를 공유해서 보여준다.
 *
 * - xl(1280px) 이상: 본문 컬럼(max-w-3xl = 48rem) 오른쪽 여백에 sticky처럼 떠 있는 사이드바.
 *   1280px에서 여백이 정확히 얼마나 남는지 계산해 폭·간격을 잡았다:
 *     본문 절반 24rem + 간격 1.5rem + 목차 폭 12rem = 37.5rem(600px) 지점에서 끝남
 *     1280px 뷰포트의 절반(640px) + 600px = 1240px < 1280px → 40px 여유
 * - xl 미만(태블릿·모바일): 사이드에 띄울 여백이 없으므로, 본문 위에 접이식(details) 박스로 노출한다.
 *
 * 활성 섹션 판정은 뷰포트 상단부에 진입한 제목들을 IntersectionObserver로 추적해
 * 문서 순서상 가장 먼저 있는 항목을 고르는 방식(스크롤 스파이)이다.
 *
 * 글이 바뀌면(App Router 클라이언트 내비게이션) 이 컴포넌트가 같은 위치에서 재사용될 수 있어
 * activeId/observer 상태가 이전 글 값으로 남을 수 있다 — 호출하는 쪽에서 `key={slug}`를 줘서
 * 글이 바뀔 때마다 완전히 새 인스턴스로 마운트되게 한다.
 */
export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const visibleIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const headingElements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headingElements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIdsRef.current.add(entry.target.id);
          } else {
            visibleIdsRef.current.delete(entry.target.id);
          }
        }

        const stillVisible = items.filter((item) => visibleIdsRef.current.has(item.id));
        if (stillVisible.length > 0) {
          setActiveId(stillVisible[0].id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    headingElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  const list = (
    <ul className="space-y-1 border-l border-border text-sm">
      {items.map((item) => {
        const isActive = activeId === item.id;

        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={isActive ? "location" : undefined}
              className={`-ml-px block border-l-2 py-1 pr-2 transition-colors ${
                item.depth === 3 ? "pl-6" : "pl-3"
              } ${
                isActive
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {item.text}
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* xl 미만: 본문 위 접이식 목차 */}
      <details className="mb-8 rounded-lg border border-border bg-surface p-4 xl:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          목차
        </summary>
        <nav aria-label="목차" className="mt-3">
          {list}
        </nav>
      </details>

      {/* xl 이상: 오른쪽 여백 사이드바 */}
      <nav
        aria-label="목차"
        className="hidden xl:fixed xl:top-24 xl:block xl:w-48 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto"
        style={{ left: "calc(50% + 25.5rem)" }}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          목차
        </p>
        {list}
      </nav>
    </>
  );
}
