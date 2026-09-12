type MarkdownProps = {
  html: string;
};

export function Markdown({ html }: MarkdownProps) {
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
