import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/PostCard";
import { getPostsByCategory } from "@/lib/posts";
import { categories, getCategoryBySlug } from "@/lib/site";

export const dynamicParams = false;

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams() {
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const category = getCategoryBySlug(categorySlug);

  if (!category) {
    return {};
  }

  return {
    title: category.name,
    description: `${category.name} 카테고리 게시글 목록입니다.`,
    alternates: {
      canonical: `/categories/${category.slug}/`,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category: categorySlug } = await params;
  const category = getCategoryBySlug(categorySlug);

  if (!category) {
    notFound();
  }

  const posts = getPostsByCategory(category.slug);

  return (
    <div>
      <p className="text-sm text-muted">Category</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{category.name}</h1>
      {posts.length > 0 ? (
        <div className="mt-8">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-muted">이 카테고리의 글이 아직 없습니다.</p>
      )}
    </div>
  );
}
