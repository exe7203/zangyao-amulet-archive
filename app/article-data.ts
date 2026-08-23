import { publishedArticles } from "../shared/published-content";
import { ARTICLE_MAX_DOCUMENT_DEPTH } from "../lib/article-content-contract";

export type TiptapNode = {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
};

export type ArticleArt = "paper" | "case" | "stamp";

export type JournalArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentJson: TiptapNode;
  status: "published";
  publishedAt: string | null;
  updatedAt: string | null;
  tag: string;
  time: string;
  art: ArticleArt;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  heroImageUrl: string;
  heroImageAlt: string;
  noindex: boolean;
  keywords: string[];
  version: number;
};

export type JournalLoadState = "loading" | "fallback" | "published" | "empty" | "error";

export type JournalApiResult = {
  state: Exclude<JournalLoadState, "loading">;
  articles: JournalArticle[];
};

const artStyles: ArticleArt[] = ["paper", "case", "stamp"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractTiptapText(value: unknown, depth = 0): string {
  if (depth > ARTICLE_MAX_DOCUMENT_DEPTH || !isRecord(value)) return "";
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content)
    ? value.content.map((child) => extractTiptapText(child, depth + 1)).join("")
    : "";
  return ownText + childText;
}

export function estimateReadingTime(contentJson: unknown): string {
  const characterCount = extractTiptapText(contentJson).replace(/\s/g, "").length;
  return `約 ${Math.max(1, Math.ceil(characterCount / 350))} 分鐘閱讀`;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeSlug(value: string): boolean {
  return /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u.test(value);
}

export function normalizePublishedArticle(value: unknown, index: number): JournalArticle | null {
  if (!isRecord(value) || value.status !== "published") return null;
  const title = cleanString(value.title);
  const slug = cleanString(value.slug);
  if (!title || !isSafeSlug(slug) || !isRecord(value.contentJson)) return null;

  return {
    id: cleanString(value.id) || `article-${index}-${slug}`,
    slug,
    title,
    excerpt: cleanString(value.excerpt),
    contentJson: value.contentJson,
    status: "published",
    publishedAt: cleanString(value.publishedAt) || null,
    updatedAt: cleanString(value.updatedAt) || null,
    tag: cleanString(value.tag) || "佛牌知識",
    time: cleanString(value.time) || estimateReadingTime(value.contentJson),
    art: artStyles.includes(value.art as ArticleArt) ? value.art as ArticleArt : artStyles[index % artStyles.length],
    seoTitle: cleanString(value.seoTitle),
    seoDescription: cleanString(value.seoDescription),
    canonicalUrl: cleanString(value.canonicalUrl),
    ogImageUrl: cleanString(value.ogImageUrl),
    heroImageUrl: cleanString(value.heroImageUrl),
    heroImageAlt: cleanString(value.heroImageAlt),
    noindex: value.noindex === true,
    keywords: Array.isArray(value.keywords)
      ? value.keywords.map(cleanString).filter(Boolean).slice(0, 12)
      : [],
    version: Number.isSafeInteger(value.version) ? Number(value.version) : 1,
  };
}

export const fallbackArticles: JournalArticle[] = publishedArticles
  .map(normalizePublishedArticle)
  .filter((article): article is JournalArticle => article !== null);

export function resolveJournalApiResult(status: number, payload?: unknown): JournalApiResult {
  if (status === 404 || status === 503) {
    return { state: "fallback", articles: [...fallbackArticles] };
  }

  if (status !== 200 || !isRecord(payload) || !Array.isArray(payload.articles)) {
    return { state: "error", articles: [] };
  }

  const articles = payload.articles
    .map(normalizePublishedArticle)
    .filter((article): article is JournalArticle => article !== null);

  return {
    state: articles.length > 0 ? "published" : "empty",
    articles,
  };
}

export function getFallbackArticle(slug: string): JournalArticle | undefined {
  return fallbackArticles.find((article) => article.slug === slug);
}
