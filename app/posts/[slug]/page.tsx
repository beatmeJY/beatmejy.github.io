import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { getAllSlugs, getPostBySlug } from "@/lib/posts";
import { formatDate, siteConfig, slugifyTag } from "@/lib/site";

export const dynamicParams = false;

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  let post;

  try {
    post = getPostBySlug(slug);
  } catch {
    return {};
  }

  const canonical = `/posts/${post.slug}/`;

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      locale: siteConfig.locale,
      url: canonical,
      siteName: siteConfig.name,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      authors: [siteConfig.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  let post;

  try {
    post = getPostBySlug(slug);
  } catch {
    notFound();
  }

  return (
    <article>
      <header className="border-b border-border pb-8">
        <p className="text-sm text-muted">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden="true"> · </span>
          <Link
            href={`/categories/${post.categorySlug}/`}
            className="hover:text-foreground"
          >
            {post.category}
          </Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-3 text-muted">{post.description}</p>
        {post.tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="태그">
            {post.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/tags/${slugifyTag(tag)}/`}
                  className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted hover:text-foreground"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="pt-8">
        <Markdown content={post.content} />
      </div>
    </article>
  );
}
