"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ArticleContent from "../../article-content";
import {
  normalizePublishedArticle,
  type JournalArticle,
} from "../../article-data";
import { SafePublicImage } from "../../product-artwork";
import { publicContentArticlePath } from "../../../shared/admin/api-paths";
import {
  publishedBrandMark,
  publishedBrandName,
  publishedEditorName,
} from "../../../shared/published-site";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import styles from "../../article-page.module.css";

const journalName = `${publishedBrandName}佛牌專欄`;

function formatPublishedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function ArticleLiveView({
  slug,
  initialArticle,
}: {
  slug: string;
  initialArticle: JournalArticle | null;
}) {
  const [article, setArticle] = useState<JournalArticle | null>(initialArticle);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    initialArticle ? "ready" : "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(publicContentArticlePath(PUBLIC_SITE_CODE, slug), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const isJsonApiResponse = response.headers.get("content-type")?.toLowerCase().includes("application/json");
        if (response.status === 404 && isJsonApiResponse) {
          setArticle(null);
          setState("unavailable");
          return;
        }
        if (!response.ok) {
          setState(initialArticle ? "ready" : "unavailable");
          return;
        }
        const payload = await response.json() as { article?: unknown };
        const liveArticle = normalizePublishedArticle(payload.article, 0);
        if (!liveArticle || liveArticle.slug !== slug) {
          setState(initialArticle ? "ready" : "unavailable");
          return;
        }
        setArticle(liveArticle);
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState(initialArticle ? "ready" : "unavailable");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialArticle, slug]);

  if (state === "loading") {
    return (
      <section className={styles.state} role="status">
        <p>正在載入文章…</p>
      </section>
    );
  }

  if (!article) {
    return (
      <section className={styles.state}>
        <h1>找不到這篇文章</h1>
        <p>文章可能尚未發布，或網址已變更。</p>
        <Link href="/articles/">返回佛牌專欄 →</Link>
      </section>
    );
  }

  const publishedLabel = formatPublishedDate(article.publishedAt);

  return (
    <>
      <nav className={styles.breadcrumb} aria-label="麵包屑">
        <ol>
          <li><Link href="/">首頁</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/articles/">佛牌專欄</Link></li>
          <li aria-hidden="true">/</li>
          <li><span aria-current="page">{article.title}</span></li>
        </ol>
      </nav>

      <article>
        <header className={styles.articleHeader}>
          <p className={styles.kicker}>{article.tag} · {article.time}</p>
          <h1>{article.title}</h1>
          <p className={styles.lead}>{article.excerpt}</p>
          <p className={styles.byline}>
            <span>{publishedEditorName}</span>
            {publishedLabel && article.publishedAt && (
              <><span aria-hidden="true">·</span><time dateTime={article.publishedAt}>{publishedLabel}</time></>
            )}
          </p>
        </header>

        {article.heroImageUrl && (
          <figure className={styles.heroMedia}>
            <SafePublicImage
              src={article.heroImageUrl}
              alt={article.heroImageAlt || `${article.title}文章首圖`}
              className={styles.heroImage}
              loading="eager"
              fetchPriority="high"
              fallback={(
                <div
                  className={styles.heroFallback}
                  role="img"
                  aria-label={`${article.title}首圖暫時無法顯示`}
                >
                  <span aria-hidden="true">{publishedBrandMark}</span>
                  <p>文章首圖暫時無法顯示</p>
                </div>
              )}
            />
            <figcaption>{article.heroImageAlt || article.title}</figcaption>
          </figure>
        )}

        <ArticleContent className={styles.content} content={article.contentJson} />

        <div className={styles.returnBlock}>
          <p>查看更多佛牌文化、商品資料與保存方式相關文章。</p>
          <Link href="/articles/">{`← 返回${journalName}`}</Link>
        </div>
      </article>
    </>
  );
}
