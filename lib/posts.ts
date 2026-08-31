import fs from "fs";
import path from "path";
import matter from "gray-matter";
import {
  getCategoryByNameOrSlug,
  slugifyTag,
  type CategorySlug,
} from "@/lib/site";

const postsDirectory = path.join(process.cwd(), "content/posts");

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  category: string;
  categorySlug: CategorySlug;
  content: string;
};

function readMarkdownFiles() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  return fs.readdirSync(postsDirectory).filter((fileName) => fileName.endsWith(".md"));
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

  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    tags,
    category: category?.name ?? "etc",
    categorySlug: category?.slug ?? "etc",
    content,
  };
}

export function getAllPosts(): Post[] {
  const posts = readMarkdownFiles().map((fileName) => {
    const slug = fileName.replace(/\.md$/, "");
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    return parsePost(slug, fileContents);
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): Post {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  return parsePost(slug, fileContents);
}

export function getAllSlugs() {
  return getAllPosts().map((post) => post.slug);
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
