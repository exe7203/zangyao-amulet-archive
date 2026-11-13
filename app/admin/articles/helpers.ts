import type { Article, Draft } from "./types";
import { EMPTY_DOCUMENT } from "./types";

export function emptyDraft(): Draft {
  return {
    id: null,
    slug: "",
    title: "",
    excerpt: "",
    contentJson: EMPTY_DOCUMENT,
    status: "draft",
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    ogImageUrl: "",
    tag: "佛牌知識",
    keywords: [],
    heroImageUrl: "",
    heroImageAlt: "",
    noindex: false,
    version: 0,
  };
}

export function slugify(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatUpdatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function normalizeArticle(value: Article): Article {
  return {
    ...value,
    contentJson: value.contentJson || EMPTY_DOCUMENT,
    status: value.status || "draft",
    tag: value.tag || "佛牌知識",
    keywords: Array.isArray(value.keywords) ? value.keywords : [],
    heroImageUrl: value.heroImageUrl || "",
    heroImageAlt: value.heroImageAlt || "",
    version: Number.isSafeInteger(value.version) ? value.version : 1,
  };
}
