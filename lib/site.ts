export const siteConfig = {
  name: "beatmeJY Tech blog",
  author: "beatmeJY",
  description:
    "백엔드 개발자가 문제와 해결 과정을 기록하는 기술 블로그입니다. Kotlin, Spring Boot, Database, AWS를 중심으로 씁니다.",
  url: "https://beatmeJY.github.io",
  github: "https://github.com/beatmeJY",
  locale: "ko_KR",
} as const;

export const categories = [
  { slug: "backend", name: "Backend" },
  { slug: "database", name: "Database" },
  { slug: "infrastructure", name: "Infrastructure" },
  { slug: "devops", name: "DevOps" },
  { slug: "architecture", name: "Architecture" },
  { slug: "retrospective", name: "Retrospective" },
  { slug: "etc", name: "etc" },
] as const;

export type CategorySlug = (typeof categories)[number]["slug"];
export type CategoryName = (typeof categories)[number]["name"];

export function getCategoryBySlug(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getCategoryByNameOrSlug(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    categories.find(
      (category) =>
        category.slug === normalized || category.name.toLowerCase() === normalized,
    ) ?? getCategoryBySlug("etc")
  );
}

export function slugifyTag(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}
