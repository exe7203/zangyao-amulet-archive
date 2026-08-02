"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TiptapNode = {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
};

type JournalArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentJson: TiptapNode;
  publishedAt: string | null;
  tag: string;
  time: string;
  art: "paper" | "case" | "stamp";
};

type JournalSectionProps = {
  onOpenChange?: (open: boolean) => void;
};

const artStyles = ["paper", "case", "stamp"] as const;

const fallbackArticles: JournalArticle[] = [
  {
    id: "guide-first-amulet",
    slug: "guide-first-amulet",
    title: "第一次接觸泰國佛牌：先看懂年份、材質與來源",
    excerpt: "先從可以查證的資料開始，建立自己的收藏判斷方式。",
    publishedAt: null,
    tag: "新手指南",
    time: "07 MIN READ",
    art: "paper",
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "先從可以查證的資訊開始" }] },
        { type: "paragraph", content: [{ type: "text", text: "第一次接觸佛牌時，不必先追求神奇說法。年份、材質、尺寸、寺院或法會來源，才是能夠被記錄與交叉確認的基礎。" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "確認佛曆與西元年份是否對得上。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "查看正反面、側邊與尺寸比例的實拍。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "把來源不確定的地方清楚標示，不用故事填補空白。" }] }] },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "收藏的第一步，是知道自己手上的資料有哪些、還缺哪些。" }] },
      ],
    },
  },
  {
    id: "amulet-case-care",
    slug: "amulet-case-care",
    title: "佛牌外殼只是保護嗎？常見材質與收藏方式",
    excerpt: "從日常配戴到長期保存，外殼與環境都會影響藏品狀態。",
    publishedAt: null,
    tag: "收藏保養",
    time: "05 MIN READ",
    art: "case",
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "外殼是保護，也是保存環境的一部分" }] },
        { type: "paragraph", content: [{ type: "text", text: "防水殼、壓克力殼與金屬框各有不同的密合方式。選擇時應先看佛牌材質是否怕潮、是否容易掉粉，以及日常配戴情境。" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "老件或粉質藏品若已有裂紋，重新包殼前應先留下完整影像紀錄。" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "長期收藏時，避免高溫、潮濕與陽光直射，並定期檢查殼內是否有霧氣或異常變化。" }] },
      ],
    },
  },
  {
    id: "provenance-record",
    slug: "provenance-record",
    title: "從寺廟到收藏櫃：一件聖物的履歷應包含什麼？",
    excerpt: "把取得、轉手與保存資訊留下來，讓下一位收藏者也看得懂。",
    publishedAt: null,
    tag: "來源紀錄",
    time: "08 MIN READ",
    art: "stamp",
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "一份可閱讀的藏品履歷" }] },
        { type: "paragraph", content: [{ type: "text", text: "完整履歷不等於保證真偽，而是把現有證據、來源說法與待確認項目分開記錄。" }] },
        { type: "orderedList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "寺院、師父、法會與年份資料。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "材質、尺寸、模具特徵與保存狀態。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "取得方式、實拍日期與後續轉手紀錄。" }] }] },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "能誠實呈現未知，通常比一個過度完整的故事更值得信任。" }] },
      ],
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractText(value: unknown, depth = 0): string {
  if (depth > 24 || !isRecord(value)) return "";
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content)
    ? value.content.map((child) => extractText(child, depth + 1)).join("")
    : "";
  return ownText + childText;
}

function estimateReadingTime(contentJson: unknown) {
  const characterCount = extractText(contentJson).replace(/\s/g, "").length;
  return `${String(Math.max(1, Math.ceil(characterCount / 350))).padStart(2, "0")} MIN READ`;
}

function normalizeArticle(value: unknown, index: number): JournalArticle | null {
  if (!isRecord(value) || value.status !== "published") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  if (!title || !slug || !isRecord(value.contentJson)) return null;

  return {
    id: typeof value.id === "string" && value.id ? value.id : `article-${index}-${slug}`,
    slug,
    title,
    excerpt: typeof value.excerpt === "string" ? value.excerpt.trim() : "",
    contentJson: value.contentJson,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    tag: "收藏誌",
    time: estimateReadingTime(value.contentJson),
    art: artStyles[index % artStyles.length],
  };
}

function safeLinkHref(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href) return null;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;

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
    if (mark.type === "bold") rendered = <strong key={key}>{rendered}</strong>;
    if (mark.type === "italic") rendered = <em key={key}>{rendered}</em>;
    if (mark.type === "underline") rendered = <span className="journal-underline" key={key}>{rendered}</span>;
    if (mark.type === "strike") rendered = <s key={key}>{rendered}</s>;
    if (mark.type === "code") rendered = <code key={key}>{rendered}</code>;
    if (mark.type === "link") {
      const href = isRecord(mark.attrs) ? safeLinkHref(mark.attrs.href) : null;
      if (href) {
        const external = href.startsWith("http://") || href.startsWith("https://");
        rendered = <a href={href} key={key} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{rendered}</a>;
      }
    }
  });

  return rendered;
}

function renderTiptapNode(value: unknown, path: string, depth = 0): ReactNode {
  if (depth > 24 || !isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "text") return renderTextNode(value, path);

  const children = Array.isArray(value.content)
    ? value.content.map((child, index) => renderTiptapNode(child, `${path}-${index}`, depth + 1))
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
      return <pre key={path}><code>{extractText(value)}</code></pre>;
    default:
      return null;
  }
}

function formatPublishedDate(value: string | null) {
  if (!value) return "泰聚達編輯部";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "泰聚達編輯部";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function JournalSection({ onOpenChange }: JournalSectionProps) {
  const [articles, setArticles] = useState<JournalArticle[]>(fallbackArticles);
  const [usingPublishedArticles, setUsingPublishedArticles] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<JournalArticle | null>(null);
  const readerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPublishedArticles() {
      try {
        const response = await fetch("/api/content/articles?site=taijuda", {
          headers: { accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload: unknown = await response.json();
        if (!isRecord(payload) || !Array.isArray(payload.articles)) return;
        const publishedArticles = payload.articles
          .map(normalizeArticle)
          .filter((article): article is JournalArticle => article !== null);
        if (publishedArticles.length === 0) return;

        setArticles(publishedArticles);
        setUsingPublishedArticles(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 靜態網站或內容 API 尚未啟用時，保留伺服器渲染的示範文章。
      }
    }

    void loadPublishedArticles();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    onOpenChange?.(selectedArticle !== null);
  }, [onOpenChange, selectedArticle]);

  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  useEffect(() => {
    if (!selectedArticle) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedArticle(null);
        return;
      }
      if (event.key !== "Tab" || !readerRef.current) return;

      const focusable = Array.from(readerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        readerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [selectedArticle]);

  return (
    <>
      <section className="journal-section" id="journal">
        <div className="section-heading">
          <div><p className="eyebrow eyebrow--dark">THE JOURNAL</p><h2>收藏誌</h2></div>
          <span className="heading-link">{usingPublishedArticles ? `${articles.length} 篇已發佈` : "閱讀全部文章 →"}</span>
        </div>
        <div className="journal-grid">
          {articles.map((article, index) => (
            <article className="journal-card" key={article.id}>
              <button type="button" className="journal-card-button" onClick={() => setSelectedArticle(article)} aria-haspopup="dialog" aria-label={`閱讀文章：${article.title}`}>
                <div className={`journal-art journal-art--${article.art}`}><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
                <p className="journal-card-meta">{article.tag} <span>{article.time}</span></p>
                <h3>{article.title}</h3>
                <span className="journal-read-link">閱讀文章 →</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      {selectedArticle && (
        <div className="journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-reader-title" aria-describedby={selectedArticle.excerpt ? "journal-reader-excerpt" : undefined}>
          <button type="button" className="journal-modal-backdrop" onClick={() => setSelectedArticle(null)} aria-label="關閉文章" tabIndex={-1} />
          <article className="journal-reader" ref={readerRef} tabIndex={-1}>
            <button type="button" className="journal-reader-close" ref={closeButtonRef} onClick={() => setSelectedArticle(null)} aria-label="關閉文章">×</button>
            <header className="journal-reader-header">
              <p>{selectedArticle.tag} · {selectedArticle.time}</p>
              <h2 id="journal-reader-title">{selectedArticle.title}</h2>
              {selectedArticle.excerpt && <p id="journal-reader-excerpt" className="journal-reader-excerpt">{selectedArticle.excerpt}</p>}
              <small>{formatPublishedDate(selectedArticle.publishedAt)}</small>
            </header>
            <div className="journal-reader-content">
              {renderTiptapNode(selectedArticle.contentJson, `article-${selectedArticle.id}`)}
            </div>
          </article>
        </div>
      )}
    </>
  );
}
