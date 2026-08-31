import type { Metadata } from "next";
import { PostCard } from "@/components/PostCard";
import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Posts",
  description: "최신순으로 정렬된 기술 블로그 게시글 목록입니다.",
  alternates: {
    canonical: "/posts/",
  },
};

export default function PostsPage() {
  const posts = getAllPosts();

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Posts</h1>
      <p className="mt-3 text-muted">최신 글부터 보여줍니다.</p>
      {posts.length > 0 ? (
        <div className="mt-8">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-muted">아직 게시글이 없습니다.</p>
      )}
    </div>
  );
}
