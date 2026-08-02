import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleContent from "../../article-content";
import {
  fallbackArticles,
  getFallbackArticle,
  type JournalArticle,
} from "../../article-data";
import styles from "../../article-page.module.css";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

function getSiteUrl(): URL {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported site URL");
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch {
    return new URL("http://127.0.0.1:3000/");
  }
}

function resolveHttpUrl(value: string, baseUrl: URL, fallbackPath: string): string {
  try {
    const url = new URL(value || fallbackPath, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL");
    return url.toString();
  } catch {
    return new URL(fallbackPath, baseUrl).toString();
  }
}

function getCanonicalUrl(article: JournalArticle, siteUrl: URL): string {
  return resolveHttpUrl(
    article.canonicalUrl,
    siteUrl,
    `articles/${encodeURIComponent(article.slug)}/`,
  );
}

function getOgImageUrl(article: JournalArticle, siteUrl: URL): string {
  return resolveHttpUrl(article.ogImageUrl, siteUrl, "og.png");
}

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

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// The project currently exports static HTML, while D1 is only available to the
// Worker at runtime. These three snapshot articles are therefore the reliable SEO
// routes. A future publish workflow should sync D1 content before triggering build.
export function generateStaticParams() {
  return fallbackArticles.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getFallbackArticle(slug);
  if (!article) {
    return {
      title: "文章不存在",
      robots: { index: false, follow: false },
    };
  }

  const siteUrl = getSiteUrl();
  const canonicalUrl = getCanonicalUrl(article, siteUrl);
  const ogImageUrl = getOgImageUrl(article, siteUrl);
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;

  return {
    title,
    description,
    keywords: article.keywords,
    alternates: { canonical: canonicalUrl },
    robots: { index: !article.noindex, follow: true },
    openGraph: {
      type: "article",
      locale: "zh_TW",
      siteName: "泰聚達",
      url: canonicalUrl,
      title,
      description,
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article.updatedAt || undefined,
      authors: ["泰聚達編輯部"],
      images: [{
        url: ogImageUrl,
        width: 1731,
        height: 909,
        alt: `${article.title}｜泰聚達收藏誌`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getFallbackArticle(slug);
  if (!article) notFound();

  const siteUrl = getSiteUrl();
  const canonicalUrl = getCanonicalUrl(article, siteUrl);
  const ogImageUrl = getOgImageUrl(article, siteUrl);
  const publishedLabel = formatPublishedDate(article.publishedAt);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonicalUrl}#article`,
        headline: article.title,
        description: article.seoDescription || article.excerpt,
        image: [ogImageUrl],
        articleSection: article.tag,
        inLanguage: "zh-Hant-TW",
        isAccessibleForFree: true,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
        author: { "@type": "Organization", name: "泰聚達編輯部", url: siteUrl.toString() },
        publisher: { "@type": "Organization", name: "泰聚達", url: siteUrl.toString() },
        ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
        ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: "收藏誌", item: new URL("#journal", siteUrl).toString() },
          { "@type": "ListItem", position: 3, name: article.title, item: canonicalUrl },
        ],
      },
    ],
  };

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#article-content">跳至文章內容</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="泰聚達首頁">
          <span aria-hidden="true">泰</span><b>泰聚達</b>
        </Link>
        <Link className={styles.homeLink} href="/#journal">返回收藏誌 →</Link>
      </header>

      <main className={styles.shell} id="article-content">
        <nav className={styles.breadcrumb} aria-label="麵包屑">
          <ol>
            <li><Link href="/">首頁</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/#journal">收藏誌</Link></li>
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
              <span>泰聚達編輯部</span>
              {publishedLabel && article.publishedAt && (
                <><span aria-hidden="true">·</span><time dateTime={article.publishedAt}>{publishedLabel}</time></>
              )}
            </p>
          </header>

          <ArticleContent className={styles.content} content={article.contentJson} />

          <div className={styles.returnBlock}>
            <p>從來源、材質與保存紀錄開始認識每一件藏品。</p>
            <Link href="/#journal">← 返回泰聚達收藏誌</Link>
          </div>
        </article>
      </main>

      <footer className={styles.footer}>
        <span>© 2026 泰聚達</span>
        <Link href="/service/contact/">聯絡與訂單協助</Link>
      </footer>
    </div>
  );
}
