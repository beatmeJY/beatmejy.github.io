import Link from "next/link";
import { formatDate, slugifyTag } from "@/lib/site";
import type { Post } from "@/lib/posts";

type PostCardProps = {
  post: Post;
};

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="border-b border-border py-6 first:pt-0 last:border-b-0">
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
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        <Link href={`/posts/${post.slug}/`} className="hover:text-accent">
          {post.title}
        </Link>
      </h2>
      <p className="mt-2 text-muted">{post.description}</p>
      {post.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="태그">
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
    </article>
  );
}
