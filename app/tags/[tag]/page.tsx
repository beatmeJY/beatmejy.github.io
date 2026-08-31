import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/PostCard";
import { getAllTags, getPostsByTag, getTagLabel } from "@/lib/posts";

export const dynamicParams = false;

type TagPageProps = {
  params: Promise<{ tag: string }>;
};

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ tag: tag.slug }));
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const label = getTagLabel(tag);

  return {
    title: `#${label}`,
    description: `${label} 태그 게시글 목록입니다.`,
    alternates: {
      canonical: `/tags/${tag}/`,
    },
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;
  const posts = getPostsByTag(tag);

  if (posts.length === 0) {
    notFound();
  }

  const label = getTagLabel(tag);

  return (
    <div>
      <p className="text-sm text-muted">Tag</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">#{label}</h1>
      <div className="mt-8">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
