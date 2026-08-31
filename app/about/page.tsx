import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "백엔드 개발자 beatmeJY의 소개, 기술 스택, GitHub입니다.",
  alternates: {
    canonical: "/about/",
  },
};

const stack = [
  "Kotlin",
  "Spring Boot",
  "PostgreSQL",
  "MySQL",
  "Redis",
  "AWS",
];

export default function AboutPage() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <p className="mt-3 text-muted">
          4년 차 백엔드 개발자 {siteConfig.author}입니다.
        </p>
      </header>

      <section aria-labelledby="intro">
        <h2 id="intro" className="text-xl font-semibold tracking-tight">
          소개
        </h2>
        <p className="mt-3 text-muted">
          Kotlin과 Spring Boot로 서비스를 만들고, PostgreSQL/MySQL, Redis, AWS를
          다룹니다. 이 블로그는 포트폴리오이자, 현장에서 겪은 문제를 다시 꺼내 볼
          수 있는 기록입니다.
        </p>
      </section>

      <section aria-labelledby="stack">
        <h2 id="stack" className="text-xl font-semibold tracking-tight">
          기술 스택
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {stack.map((item) => (
            <li
              key={item}
              className="rounded-md border border-border bg-surface px-3 py-1 text-sm"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="links">
        <h2 id="links" className="text-xl font-semibold tracking-tight">
          GitHub / 프로젝트
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          <li>
            GitHub:{" "}
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              {siteConfig.github}
            </a>
          </li>
          <li>
            이 블로그: GitHub Pages에 정적 배포하는 Next.js 기술 블로그
          </li>
        </ul>
      </section>
    </article>
  );
}
