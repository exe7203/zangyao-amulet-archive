"use client";

import Link from "next/link";
import { fallbackArticles } from "./article-data";

type JournalSectionProps = {
  onOpenChange?: (open: boolean) => void;
};

export default function JournalSection({ onOpenChange }: JournalSectionProps) {
  void onOpenChange;
  const articles = fallbackArticles;

  return (
    <section className="journal-section" id="journal">
      <div className="section-heading">
        <div><p className="eyebrow eyebrow--dark">THE JOURNAL</p><h2>收藏誌</h2></div>
        <Link className="heading-link" href="/articles/">查看全部 {articles.length} 篇 →</Link>
      </div>

      {articles.length === 0 ? (
        <div className="journal-empty" role="status">
          <h3>目前尚無公開文章</h3>
          <p>內容同步至公開 SEO 版後，會顯示在這裡。</p>
        </div>
      ) : (
        <div className="journal-grid">
          {articles.slice(0, 6).map((article, index) => (
            <article className="journal-card" key={article.id}>
              <Link className="journal-card-button" href={`/articles/${encodeURIComponent(article.slug)}/`} aria-label={`閱讀文章：${article.title}`}>
                <div className={`journal-art journal-art--${article.art}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span><i />
                </div>
                <p className="journal-card-meta">{article.tag} <span>{article.time}</span></p>
                <h3>{article.title}</h3>
                <span className="journal-read-link">閱讀完整文章 →</span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
