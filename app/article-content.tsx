import { Fragment, type ReactNode } from "react";
import {
  ARTICLE_MAX_DOCUMENT_DEPTH,
  articleHrefForPublicSite,
  safeArticleImageAttributes,
  validateArticleDocument,
  validateArticleTableNode,
} from "../lib/article-content-contract";
import { extractTiptapText, isRecord, type TiptapNode } from "./article-data";
import { SafePublicImage } from "./product-artwork";

export { safeArticleLinkHref } from "../lib/article-content-contract";

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
        const href = isRecord(mark.attrs)
          ? articleHrefForPublicSite(mark.attrs.href, process.env.PAGES_BASE_PATH || "")
          : null;
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
  if (depth > ARTICLE_MAX_DOCUMENT_DEPTH || !isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  if (value.type === "text") return renderTextNode(value, path);

  if (value.type === "image") {
    const image = safeArticleImageAttributes(value.attrs);
    if (!image) return null;
    return (
      <figure key={path} data-article-image="true">
        <SafePublicImage
          src={image.src}
          alt={image.alt}
          fallback={<span role="img" aria-label={image.alt} data-article-image-fallback="true">圖片暫時無法顯示</span>}
        />
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </figure>
    );
  }

  if (value.type === "table") {
    if (!validateArticleTableNode(value) || !Array.isArray(value.content)) return null;
    const rows = value.content;
    const firstRow = rows[0];
    const hasHeaderRow = isRecord(firstRow) && Array.isArray(firstRow.content) &&
      firstRow.content.length > 0 && firstRow.content.every((cell) => isRecord(cell) && cell.type === "tableHeader");
    const renderRows = (items: unknown[], offset: number) => items.map((row, index) => (
      renderTiptapNode(row, `${path}-row-${index + offset}`, depth + 1)
    ));
    return (
      <div
        key={path}
        data-article-table-scroll="true"
        role="region"
        aria-label="文章資料表，可左右捲動查看完整內容"
        tabIndex={0}
      >
        <table>
          {hasHeaderRow && <thead>{renderRows(rows.slice(0, 1), 0)}</thead>}
          <tbody>{renderRows(hasHeaderRow ? rows.slice(1) : rows, hasHeaderRow ? 1 : 0)}</tbody>
        </table>
      </div>
    );
  }

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
    case "tableRow":
      return <tr key={path}>{children}</tr>;
    case "tableHeader":
      return <th key={path} scope="col">{children}</th>;
    case "tableCell":
      return <td key={path}>{children}</td>;
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
  return <div className={className}>{validateArticleDocument(content) ? renderTiptapNode(content, "article-content") : null}</div>;
}
