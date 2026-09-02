import { renderMarkdown } from "@/lib/markdown";

type MarkdownProps = {
  content: string;
};

export async function Markdown({ content }: MarkdownProps) {
  const html = await renderMarkdown(content);

  return (
    <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
