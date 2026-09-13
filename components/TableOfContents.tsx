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
 * 활성 섹션 판정: 스크롤할 때마다 "화면 상단 기준선(120px)보다 위로 올라온 제목 중
 * 문서 순서상 가장 마지막 것"을 계산해서 고른다. IntersectionObserver로 진입/이탈 이벤트를
 * 누적하는 방식은 스크롤이 한 번에 크게 튀면(트랙패드 플릭 등) 감시 구간을 건너뛰어 갱신이
 * 멈출 수 있어서, 매번 실제 위치를 다시 계산하는 이 방식으로 바꿨다 — 건너뛸 여지가 없다.
 *
 * 글이 바뀌면(App Router 클라이언트 내비게이션) 이 컴포넌트가 같은 위치에서 재사용될 수 있어
 * activeId/observer 상태가 이전 글 값으로 남을 수 있다 — 호출하는 쪽에서 `key={slug}`를 줘서
 * 글이 바뀔 때마다 완전히 새 인스턴스로 마운트되게 한다.
 */
export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [isOpen, setIsOpen] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const headingElements = items
      .map((item) => ({ id: item.id, el: document.getElementById(item.id) }))
      .filter((h): h is { id: string; el: HTMLElement } => h.el !== null);

    if (headingElements.length === 0) {
      return;
    }

    // "현재 읽는 위치"로 볼 기준선. 화면 상단에서 이보다 위로 올라온(=지나친) 제목 중
    // 문서 순서상 가장 마지막 것을 활성으로 본다. 제목은 이미 문서 순서로 정렬돼 있으므로
    // 기준선을 넘지 않은 첫 제목을 만나는 순간 멈춘다.
    const THRESHOLD_PX = 120;

    function updateActiveId() {
      let current = headingElements[0].id;

      for (const { id, el } of headingElements) {
        if (el.getBoundingClientRect().top <= THRESHOLD_PX) {
          current = id;
        } else {
          break;
        }
      }

      setActiveId(current);
    }

    updateActiveId();

    // requestAnimationFrame으로 스로틀하면 탭/패널이 백그라운드로 밀렸을 때 rAF 자체가
    // 멈춰서 갱신이 안 될 수 있다. 제목 수가 많아야 수십 개라 매 스크롤마다 그대로
    // 계산해도 부담이 없으므로, 스크롤 이벤트에서 바로 계산한다.
    window.addEventListener("scroll", updateActiveId, { passive: true });
    window.addEventListener("resize", updateActiveId);

    return () => {
      window.removeEventListener("scroll", updateActiveId);
      window.removeEventListener("resize", updateActiveId);
    };
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

  // 데스크톱 사이드바(전체 표시)와 달리 모바일 목차는 3줄 높이로 잘려 자체 스크롤이 있다.
  // 페이지를 스크롤해 activeId가 바뀌어도 그 항목이 목차의 스크롤 영역 밖에 있으면 안 보이므로,
  // 매번 그 링크가 보이도록 (페이지 스크롤은 건드리지 않고) nav 내부 scrollTop만 옮겨준다.
  useEffect(() => {
    if (!activeId) {
      return;
    }

    const links = document.querySelectorAll<HTMLAnchorElement>(
      `nav[aria-label="목차"] a[href="#${CSS.escape(activeId)}"]`,
    );

    links.forEach((link) => {
      const container = link.closest("nav");
      if (!container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      const isAbove = linkRect.top < containerRect.top;
      const isBelow = linkRect.bottom > containerRect.bottom;

      if (isAbove || isBelow) {
        const delta =
          linkRect.top - containerRect.top - container.clientHeight / 2 + linkRect.height / 2;
        container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
      }
    });
  }, [activeId]);

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
              <nav aria-label="목차" className="max-h-24 overflow-y-auto px-4 pb-4">
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
