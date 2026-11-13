import type { Metadata } from "next";
import {
  fallbackArticles,
  getFallbackArticle,
  type JournalArticle,
} from "../../article-data";
import {
  publishedBrandName,
  publishedEditorName,
} from "../../../shared/published-site";
import { serializeJsonLd } from "../../../shared/json-ld";
import { isPublishedArticleIndexable } from "../../../shared/seo-indexing";
import styles from "../../article-page.module.css";
import PublicFooter from "../../public-footer";
import PublicHeader from "../../public-header";
import { resolveSiteUrl } from "../../../shared/site-url";
import ArticleLiveView from "./article-live-view";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

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

// Snapshot articles stay prerendered for SEO. Newly published D1 slugs resolve
// at Worker runtime via dynamicParams + ArticleLiveView.
export function generateStaticParams() {
  return fallbackArticles.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = true;

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getFallbackArticle(slug);
  if (!article) {
    return {
      title: "文章",
      robots: { index: false, follow: false },
    };
  }

  const site = resolveSiteUrl();
  const canonicalUrl = site.publicUrl ? getCanonicalUrl(article, site.publicUrl) : null;
  const ogImageUrl = site.publicUrl ? getOgImageUrl(article, site.publicUrl) : null;
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;

  return {
    title,
    description,
    keywords: article.keywords,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    robots: { index: site.indexable && isPublishedArticleIndexable(article), follow: site.indexable },
    openGraph: {
      type: "article",
      locale: "zh_TW",
      siteName: publishedBrandName,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      title,
      description,
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article.updatedAt || undefined,
      authors: [publishedEditorName],
      ...(ogImageUrl ? { images: [{
        url: ogImageUrl,
        width: 1731,
        height: 909,
        alt: `${article.title}｜${publishedBrandName}佛牌專欄`,
      }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getFallbackArticle(slug) ?? null;

  const publicSiteUrl = resolveSiteUrl().publicUrl;
  const canonicalUrl = article && publicSiteUrl ? getCanonicalUrl(article, publicSiteUrl) : null;
  const ogImageUrl = article && publicSiteUrl ? getOgImageUrl(article, publicSiteUrl) : null;
  const structuredData = article && canonicalUrl && ogImageUrl && publicSiteUrl ? {
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
        author: { "@type": "Organization", name: publishedEditorName, url: publicSiteUrl.toString() },
        publisher: { "@type": "Organization", name: publishedBrandName, url: publicSiteUrl.toString() },
        ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
        ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: publicSiteUrl.toString() },
          { "@type": "ListItem", position: 2, name: "佛牌專欄", item: new URL("articles/", publicSiteUrl).toString() },
          { "@type": "ListItem", position: 3, name: article.title, item: canonicalUrl },
        ],
      },
    ],
  } : null;

  return (
    <div className={styles.page}>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      )}
      <PublicHeader section="journal" mainId="article-content" contextLinks={[{ href: "/articles/", label: "返回佛牌專欄 →" }]} />

      <main className={styles.shell} id="article-content">
        <ArticleLiveView slug={slug} initialArticle={article} />
      </main>

      <PublicFooter />
    </div>
  );
}
