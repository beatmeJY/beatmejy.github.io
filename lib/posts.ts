import fs from "fs";
import path from "path";
import matter from "gray-matter";
import {
  getCategoryByNameOrSlug,
  slugifyTag,
  type CategorySlug,
} from "@/lib/site";

const postsDirectory = path.join(process.cwd(), "content/posts");

function includeDrafts() {
  return process.env.NODE_ENV === "development";
}

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  category: string;
  categorySlug: CategorySlug;
  /** 메인(홈) 인기 글 순위. 클수록 위. 없으면 홈 인기 목록에 안 나옴. */
  popularRank: number | null;
  draft: boolean;
  content: string;
};

function isPostMarkdownFile(fileName: string) {
  return fileName.endsWith(".md") && !fileName.startsWith("_");
}

function readMarkdownFiles() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  return fs.readdirSync(postsDirectory).filter(isPostMarkdownFile);
}

function parsePost(slug: string, fileContents: string): Post {
  const { data, content } = matter(fileContents);

  if (typeof data.title !== "string" || data.title.trim() === "") {
    throw new Error(`Post "${slug}" is missing a title.`);
  }

  if (typeof data.description !== "string" || data.description.trim() === "") {
    throw new Error(`Post "${slug}" is missing a description.`);
  }

  if (typeof data.date !== "string" || Number.isNaN(Date.parse(data.date))) {
    throw new Error(`Post "${slug}" has an invalid date.`);
  }

  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  const categoryValue = typeof data.category === "string" ? data.category : "etc";
  const category = getCategoryByNameOrSlug(categoryValue);

  const popularRank =
    typeof data.popularRank === "number" &&
    Number.isFinite(data.popularRank) &&
    data.popularRank > 0
      ? data.popularRank
      : null;

  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    tags,
    category: category?.name ?? "etc",
    categorySlug: category?.slug ?? "etc",
    popularRank,
    draft: data.draft === true,
    content,
  };
}

function readPostFile(slug: string): Post {
  if (slug.startsWith("_")) {
    throw new Error(`Post "${slug}" is a template file.`);
  }

  const fullPath = path.join(postsDirectory, `${slug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  return parsePost(slug, fileContents);
}

export function getAllPosts(options?: { includeDrafts?: boolean }): Post[] {
  const showDrafts = options?.includeDrafts ?? includeDrafts();
  const posts = readMarkdownFiles().map((fileName) => {
    const slug = fileName.replace(/\.md$/, "");
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    return parsePost(slug, fileContents);
  });

  return posts
    .filter((post) => showDrafts || !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** 메인 홈용. `popularRank`가 있는 글만, 순위 내림차순(큰 수가 가장 위). */
export function getPopularPosts(options?: { includeDrafts?: boolean }): Post[] {
  return getAllPosts(options)
    .filter((post) => post.popularRank !== null)
    .sort((a, b) => {
      const rankDiff = (b.popularRank as number) - (a.popularRank as number);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
}

export function getPostBySlug(slug: string): Post {
  const post = readPostFile(slug);

  if (post.draft && !includeDrafts()) {
    throw new Error(`Post "${slug}" is a draft.`);
  }

  return post;
}

export function getAllSlugs() {
  return getAllPosts({ includeDrafts: includeDrafts() }).map((post) => post.slug);
}

export function getPostsByCategory(categorySlug: string) {
  return getAllPosts().filter((post) => post.categorySlug === categorySlug);
}

export function getAllTags() {
  const tags = new Map<string, string>();

  for (const post of getAllPosts()) {
    for (const tag of post.tags) {
      tags.set(slugifyTag(tag), tag);
    }
  }

  return Array.from(tags, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
}

export function getPostsByTag(tagSlug: string) {
  return getAllPosts().filter((post) =>
    post.tags.some((tag) => slugifyTag(tag) === tagSlug),
  );
}

export function getTagLabel(tagSlug: string) {
  return getAllTags().find((tag) => tag.slug === tagSlug)?.name ?? tagSlug;
}
