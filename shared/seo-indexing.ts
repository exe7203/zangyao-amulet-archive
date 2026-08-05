import { evaluateArticlePublishReadiness } from "../lib/article-content-contract";

const NON_INDEXABLE_STATIC_PATHS = new Set([
  "service/shipping/",
  "service/returns/",
  "service/contact/",
  "service/privacy/",
]);

const DUPLICATE_PUBLIC_PAGE_SLUGS = new Set([
  "brand-story",
]);

function normalizedPath(value: string) {
  return value.trim().replace(/^\/+|\/+$/gu, "");
}

export function isStaticPathIndexable(path: string) {
  return !NON_INDEXABLE_STATIC_PATHS.has(`${normalizedPath(path)}/`);
}

export function isPublishedPageIndexable(page: { slug: string; noindex: boolean }) {
  return !page.noindex && !DUPLICATE_PUBLIC_PAGE_SLUGS.has(page.slug);
}

export function isPublishedArticleIndexable(article: {
  status?: string;
  noindex: boolean;
  excerpt: unknown;
  seoTitle: unknown;
  seoDescription: unknown;
  contentJson: unknown;
}) {
  if (article.status !== undefined && article.status !== "published") return false;
  return !article.noindex && evaluateArticlePublishReadiness(article).ok;
}
