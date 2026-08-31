import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/posts";
import { categories, siteConfig } from "@/lib/site";

export const dynamic = "force-static";

function url(path: string) {
  return new URL(path, `${siteConfig.url}/`).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const tags = getAllTags();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: url("/"),
      lastModified: posts[0]?.date,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: url("/posts/"),
      lastModified: posts[0]?.date,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: url("/about/"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: url(`/posts/${post.slug}/`),
    lastModified: post.date,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: url(`/categories/${category.slug}/`),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const tagRoutes: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: url(`/tags/${tag.slug}/`),
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...postRoutes, ...categoryRoutes, ...tagRoutes];
}
