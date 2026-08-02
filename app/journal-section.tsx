"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ArticleContent from "./article-content";
import {
  fallbackArticles,
  resolveJournalApiResult,
  type JournalArticle,
  type JournalLoadState,
} from "./article-data";
import { useModalFocus } from "./use-modal-focus";

type JournalSectionProps = {
  onOpenChange?: (open: boolean) => void;
};

function statusLabel(state: JournalLoadState, articleCount: number): string {
  switch (state) {
    case "published":
      return `${articleCount} 篇已發佈`;
    case "empty":
      return "目前尚無文章";
    case "error":
      return "文章暫時無法載入";
    case "fallback":
      return `${articleCount} 篇收藏文章`;
    default:
      return "正在同步文章…";
  }
}

function formatPublishedDate(value: string | null): string {
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
  // The static snapshot keeps real article links in server-rendered HTML. The API
  // may replace it after hydration, but only an explicit 404/503 uses the fallback.
  const [articles, setArticles] = useState<JournalArticle[]>([...fallbackArticles]);
  const [loadState, setLoadState] = useState<JournalLoadState>("loading");
  const [selected, setSelected] = useState<JournalArticle | null>(null);
  const readerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(Boolean(selected), readerRef, closeRef, () => setSelected(null));

  useEffect(() => {
    onOpenChange?.(selected !== null);
    return () => onOpenChange?.(false);
  }, [onOpenChange, selected]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPublishedArticles() {
      try {
        const response = await fetch("/api/content/articles?site=taijuda", {
          headers: { accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });

        let payload: unknown;
        if (response.status !== 404 && response.status !== 503) {
          try {
            payload = await response.json();
          } catch {
            payload = undefined;
          }
        }

        const result = resolveJournalApiResult(response.status, payload);
        setArticles(result.articles);
        setLoadState(result.state);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Network failures and unexpected API errors must not masquerade as
        // published fallback content; readers get a visible unavailable state.
        setArticles([]);
        setLoadState("error");
      }
    }

    void loadPublishedArticles();
    return () => controller.abort();
  }, []);

  return (
    <>
    <section className="journal-section" id="journal">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow--dark">THE JOURNAL</p><h2>收藏誌</h2></div>
        <span className="heading-link">{statusLabel(loadState, articles.length)}</span>
      </div>

      {loadState === "empty" ? (
        <div className="journal-empty" role="status">
          <h3>目前尚無已發佈文章</h3>
          <p>內容編輯完成並發佈後，會顯示在這裡。</p>
        </div>
      ) : loadState === "error" ? (
        <div className="journal-empty" role="alert">
          <h3>收藏誌暫時無法載入</h3>
          <p>請稍後再試，或先從首頁瀏覽藏品與來源紀錄。</p>
        </div>
      ) : (
        <div className="journal-grid">
          {articles.map((article, index) => (
            <article className="journal-card" key={article.id}>
              {loadState === "published" ? <button className="journal-card-button" type="button" onClick={() => setSelected(article)} aria-haspopup="dialog" aria-label={`閱讀文章：${article.title}`}>
                <div className={`journal-art journal-art--${article.art}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span><i />
                </div>
                <p className="journal-card-meta">{article.tag} <span>{article.time}</span></p>
                <h3>{article.title}</h3>
                <span className="journal-read-link">閱讀文章 →</span>
              </button> : <Link className="journal-card-button" href={`/articles/${encodeURIComponent(article.slug)}/`} aria-label={`閱讀文章：${article.title}`}>
                <div className={`journal-art journal-art--${article.art}`}><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
                <p className="journal-card-meta">{article.tag} <span>{article.time}</span></p>
                <h3>{article.title}</h3>
                <span className="journal-read-link">閱讀完整文章 →</span>
              </Link>}
            </article>
          ))}
        </div>
      )}
    </section>
    {selected && <div className="journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-reader-title" aria-describedby={selected.excerpt ? "journal-reader-excerpt" : undefined}>
      <button type="button" className="journal-modal-backdrop" onClick={() => setSelected(null)} aria-label="關閉文章" tabIndex={-1} />
      <article className="journal-reader" ref={readerRef} tabIndex={-1}>
        <button ref={closeRef} type="button" className="journal-reader-close" onClick={() => setSelected(null)} aria-label="關閉文章">×</button>
        <header className="journal-reader-header"><p>{selected.tag} · {selected.time}</p><h2 id="journal-reader-title">{selected.title}</h2>{selected.excerpt && <p id="journal-reader-excerpt" className="journal-reader-excerpt">{selected.excerpt}</p>}<small>{formatPublishedDate(selected.publishedAt)}</small></header>
        <ArticleContent content={selected.contentJson} className="journal-reader-content" />
      </article>
    </div>}
    </>
  );
}
