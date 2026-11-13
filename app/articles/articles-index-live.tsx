"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  resolveJournalApiResult,
  type JournalArticle,
} from "../article-data";
import { publicContentArticlesPath } from "../../shared/admin/api-paths";
import { PUBLIC_SITE_CODE } from "../../shared/site-context";
import styles from "./articles-index.module.css";

export default function ArticlesIndexLive({
  initialArticles,
}: {
  initialArticles: JournalArticle[];
}) {
  const [articles, setArticles] = useState<JournalArticle[]>(initialArticles);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(publicContentArticlesPath(PUBLIC_SITE_CODE), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        const result = resolveJournalApiResult(response.status, payload);
        if (result.state === "error") return;
        setArticles(result.articles);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 靜態公開版或 API 不可用時，保留快照文章。
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (articles.length === 0) {
    return (
      <section className={styles.grid} aria-label="佛牌文章" role="status">
        <article>
          <p>00 · 文章專欄</p>
          <h2>目前尚無公開文章</h2>
          <span>文章準備中，歡迎稍後再回來看看。</span>
        </article>
      </section>
    );
  }

  return (
    <section className={styles.grid} aria-label="佛牌文章">
      {articles.map((article, index) => (
        <article key={article.id}>
          <p>{String(index + 1).padStart(2, "0")} · {article.tag}</p>
          <h2><Link href={`/articles/${article.slug}/`}>{article.title}</Link></h2>
          <span>{article.excerpt}</span>
          <small>{article.time}</small>
        </article>
      ))}
    </section>
  );
}
