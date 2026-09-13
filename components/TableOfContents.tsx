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
 * - xl 미만(태블릿·모바일): 사이드에 띄울 여백이 없으므로, 화면 상단에 sticky로 붙는 접이식
 *   막대로 노출한다. 스크롤에 실제로 달라붙었는지는 높이 0짜리 sentinel을 관찰해서 판단하고,
 *   그 순간에만 그림자·블러를 살짝 키워 "떠 있다"는 느낌을 준다. 펼침/접힘은 네이티브
 *   `<details>`의 즉시 토글 대신 `grid-template-rows` 트랜지션으로 부드럽게 처리한다
 *   (높이를 미리 몰라도 auto까지 애니메이션되는, JS 없이 CSS만으로 되는 표준적인 방법).
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
  const [isOpen, setIsOpen] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    // sentinel이 화면(상단)을 벗어나는 순간 = 목차 막대가 실제로 달라붙은 순간
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 1 },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

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
      {/* xl 미만: 화면 상단에 붙어서 스크롤해도 따라오는 접이식 목차 */}
      <div ref={sentinelRef} className="h-0 xl:hidden" aria-hidden="true" />
      <div className="sticky top-0 z-40 mb-8 xl:hidden">
        <div
          className={`overflow-hidden rounded-xl border bg-surface/80 backdrop-blur-md transition-[box-shadow,border-color] duration-300 ease-out ${
            isStuck
              ? "border-border/80 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]"
              : "border-border shadow-none"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground"
          >
            목차
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 text-muted transition-transform duration-300 ease-out ${
                isOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            >
              <path d="M5 7.5 10 12.5 15 7.5" />
            </svg>
          </button>

          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden" inert={!isOpen}>
              <nav aria-label="목차" className="max-h-[70vh] overflow-y-auto px-4 pb-4">
                {list}
              </nav>
            </div>
          </div>
        </div>
      </div>

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
