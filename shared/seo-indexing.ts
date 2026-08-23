import { evaluateArticlePublishReadiness } from "../lib/article-content-contract";
import { siteHasPublicContact, type SiteIdentitySettings } from "./site-settings";

/** 與 /about 重複的品牌頁，維持 noindex 避免搜尋重複內容 */
const DUPLICATE_PUBLIC_PAGE_SLUGS = new Set([
  "brand-story",
]);

/** 客服頁在尚未公布聯絡管道前不進索引，避免空殼頁被收錄 */
const CONTACT_DEPENDENT_PATHS = new Set([
  "service/contact/",
]);

function normalizedPath(value: string) {
  return value.trim().replace(/^\/+|\/+$/gu, "");
}

export type StaticPathIndexOptions = {
  /** 是否已有公開客服管道（Email／電話／LINE） */
  hasPublicContact?: boolean;
};

/**
 * 靜態服務頁可索引策略：
 * - shipping／returns／privacy：政策頁可索引（信任與合規）
 * - contact：僅在已公布客服管道時可索引
 */
export function isStaticPathIndexable(path: string, options: StaticPathIndexOptions = {}) {
  const normalized = `${normalizedPath(path)}/`;
  if (CONTACT_DEPENDENT_PATHS.has(normalized)) {
    return options.hasPublicContact === true;
  }
  return true;
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

/** 依全站設定推導靜態路徑索引選項 */
export function staticPathIndexOptionsFromSettings(settings: SiteIdentitySettings): StaticPathIndexOptions {
  return { hasPublicContact: siteHasPublicContact(settings) };
}
