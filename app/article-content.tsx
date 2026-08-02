import { Fragment, type ReactNode } from "react";
import { extractTiptapText, isRecord, type TiptapNode } from "./article-data";

const MAX_DOCUMENT_DEPTH = 24;

export function safeArticleLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href) return null;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  if (/^tel:\+?[0-9()\-\s]{6,24}$/i.test(href)) return href;

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderTextNode(node: Record<string, unknown>, path: string): ReactNode {
  let rendered: ReactNode = typeof node.text === "string" ? node.text : "";
  const marks = Array.isArray(node.marks) ? node.marks : [];

  marks.forEach((mark, index) => {
    if (!isRecord(mark) || typeof mark.type !== "string") return;
    const key = `${path}-mark-${index}`;

    switch (mark.type) {
      case "bold":
        rendered = <strong key={key}>{rendered}</strong>;
        break;
      case "italic":
        rendered = <em key={key}>{rendered}</em>;
        break;
      case "underline":
        rendered = <u key={key}>{rendered}</u>;
        break;
      case "strike":
        rendered = <s key={key}>{rendered}</s>;
        break;
      case "code":
        rendered = <code key={key}>{rendered}</code>;
        break;
      case "link": {
        const href = isRecord(mark.attrs) ? safeArticleLinkHref(mark.attrs.href) : null;
        if (!href) break;
        const external = href.startsWith("http://") || href.startsWith("https://");
        rendered = (
          <a
            href={href}
            key={key}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {rendered}
          </a>
        );
        break;
      }
      default:
        break;
    }
  });

  return rendered;
}

export function renderTiptapNode(value: unknown, path: string, depth = 0): ReactNode {
  if (depth > MAX_DOCUMENT_DEPTH || !isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  if (value.type === "text") return renderTextNode(value, path);

  const children = Array.isArray(value.content)
    ? value.content
      .map((child, index) => renderTiptapNode(child, `${path}-${index}`, depth + 1))
      .filter((child) => child !== null)
    : [];

  switch (value.type) {
    case "doc":
      return <Fragment key={path}>{children}</Fragment>;
    case "paragraph":
      return <p key={path}>{children.length > 0 ? children : <br />}</p>;
    case "heading": {
      const requestedLevel = isRecord(value.attrs) && typeof value.attrs.level === "number"
        ? value.attrs.level
        : 2;
      const level = Math.min(4, Math.max(2, Math.round(requestedLevel)));
      const Heading = `h${level}` as "h2" | "h3" | "h4";
      return <Heading key={path}>{children}</Heading>;
    }
    case "bulletList":
      return <ul key={path}>{children}</ul>;
    case "orderedList":
      return <ol key={path}>{children}</ol>;
    case "listItem":
      return <li key={path}>{children}</li>;
    case "blockquote":
      return <blockquote key={path}>{children}</blockquote>;
    case "hardBreak":
      return <br key={path} />;
    case "horizontalRule":
      return <hr key={path} />;
    case "codeBlock":
      return <pre key={path}><code>{extractTiptapText(value)}</code></pre>;
    default:
      // Unknown Tiptap extensions are intentionally not rendered. Text is always
      // emitted by React rather than inserted as HTML, so editor JSON cannot run code.
      return null;
  }
}

export default function ArticleContent({
  content,
  className,
}: {
  content: TiptapNode;
  className?: string;
}) {
  return <div className={className}>{renderTiptapNode(content, "article-content")}</div>;
}
