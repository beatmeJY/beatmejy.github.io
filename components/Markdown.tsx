import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  content: string;
};

const components: Components = {
  a({ href, children }) {
    const isExternal = href?.startsWith("http");

    return (
      <a
        href={href}
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const imageSrc = typeof src === "string" ? src : "";

    // Markdown images have unknown width/height; static export also disables next/image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageSrc} alt={alt ?? ""} />;
  },
};

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
