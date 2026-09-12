import type { Element, Root } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import rehypeExternalLinks from "rehype-external-links";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";

export type TocItem = {
  id: string;
  text: string;
  depth: 2 | 3;
};

export type RenderedMarkdown = {
  html: string;
  toc: TocItem[];
};

/**
 * 제목 텍스트를 URL 프래그먼트로 쓸 수 있는 id로 변환한다.
 * 한글은 그대로 두고, 구두점만 제거한 뒤 공백을 하이픈으로 바꾼다.
 */
function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=|{}[\]:;"'<>,.?/\\]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * h2/h3 제목에 id를 부여하고, 목차(TOC) 항목을 file.data.toc에 수집한다.
 * 같은 텍스트의 제목이 여러 번 나오면 id 뒤에 순번을 붙여 중복을 피한다.
 */
function rehypeHeadingsToc() {
  return (tree: Root, file: VFile) => {
    const toc: TocItem[] = [];
    const usedSlugs = new Map<string, number>();

    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") {
        return;
      }

      const text = hastToString(node).trim();
      if (!text) {
        return;
      }

      const base = slugifyHeading(text) || `section-${toc.length + 1}`;
      const usedCount = usedSlugs.get(base) ?? 0;
      usedSlugs.set(base, usedCount + 1);
      const id = usedCount === 0 ? base : `${base}-${usedCount}`;

      node.properties = { ...node.properties, id };
      toc.push({ id, text, depth: node.tagName === "h2" ? 2 : 3 });
    });

    file.data.toc = toc;
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHeadingsToc)
  .use(rehypePrettyCode, {
    theme: {
      light: "github-light",
      dark: "github-dark",
    },
    keepBackground: false,
  })
  .use(rehypeExternalLinks, {
    target: "_blank",
    rel: ["noopener", "noreferrer"],
  })
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function renderMarkdown(content: string): Promise<RenderedMarkdown> {
  const file = await processor.process(content);

  return {
    html: String(file),
    toc: (file.data.toc as TocItem[] | undefined) ?? [],
  };
}
