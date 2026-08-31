import type { Metadata } from "next";
import Link from "next/link";
import { CategoryList } from "@/components/CategoryList";
import { PostCard } from "@/components/PostCard";
import { getAllPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  description: siteConfig.description,
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  const recentPosts = getAllPosts().slice(0, 5);

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="intro-heading">
        <p className="text-sm text-muted">{siteConfig.author}</p>
        <h1 id="intro-heading" className="mt-2 text-3xl font-semibold tracking-tight">
          {siteConfig.name}
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Kotlin과 Spring Boot를 중심으로 백엔드 시스템을 만드는 개발자입니다.
          장애, 성능, 동시성, 데이터 모델링처럼 현장에서 마주친 문제를 왜 그렇게
          풀었는지와 함께 기록합니다.
        </p>
        <p className="mt-4">
          <Link href="/about/" className="text-accent hover:text-accent-hover">
            About 보기
          </Link>
        </p>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="recent-heading" className="text-xl font-semibold tracking-tight">
            최근 게시글
          </h2>
          <Link href="/posts/" className="text-sm text-muted hover:text-foreground">
            전체 보기
          </Link>
        </div>
        {recentPosts.length > 0 ? (
          <div>
            {recentPosts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-muted">아직 게시글이 없습니다.</p>
        )}
      </section>

      <section aria-labelledby="category-heading">
        <h2 id="category-heading" className="mb-4 text-xl font-semibold tracking-tight">
          주요 기술 카테고리
        </h2>
        <CategoryList />
      </section>
    </div>
  );
}
