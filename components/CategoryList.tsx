import Link from "next/link";
import { categories } from "@/lib/site";

export function CategoryList() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={`/categories/${category.slug}/`}
            className="block rounded-lg border border-border bg-surface px-3 py-3 text-sm font-medium shadow-[var(--shadow)] hover:border-accent"
          >
            {category.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
