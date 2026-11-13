import type { PageRecord, PageStatus } from "../../site-builder/types";
import { normalizePageData } from "../../site-builder/validation";
import type { HomeSectionId } from "../../../shared/site-settings";

export type PageRevision = {
  revisionId: string;
  pageId: string;
  title: string;
  status: PageStatus;
  version: number;
  createdAt: string;
};

export type PageFilter = "all" | PageStatus;

export type PageListPagination = {
  page: number;
  limit: number;
  maxLimit: number;
  total: number;
  totalPages: number;
  returned: number;
};

export type PageListSelection = "initial" | "preserve" | "force";

export type PageListOptions = {
  query?: string;
  status?: PageFilter;
  page?: number;
  preferredId?: string;
  selection?: PageListSelection;
};

export const EMPTY_PAGE_PAGINATION: PageListPagination = {
  page: 1,
  limit: 40,
  maxLimit: 100,
  total: 0,
  totalPages: 0,
  returned: 0,
};

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: "主視覺與服務特色",
  collections: "商品分類",
  products: "最新商品",
  themes: "附加服務",
  archive: "選購說明",
  journal: "文章專欄",
};

export type SiteSettingsRevision = {
  revisionId: string;
  version: number;
  savedBy: string;
  createdAt: string;
  settings: unknown;
  theme: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

export function normalizePage(value: unknown): PageRecord | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const slug = text(value.slug);
  const status = value.status;
  if (!id || !title || !slug || (status !== "draft" && status !== "published" && status !== "archived")) return null;

  return {
    id,
    title,
    slug,
    data: normalizePageData(value.data),
    status,
    seoTitle: text(value.seoTitle),
    seoDescription: text(value.seoDescription),
    canonicalUrl: text(value.canonicalUrl),
    ogImageUrl: text(value.ogImageUrl),
    noindex: value.noindex === true,
    version: Number.isSafeInteger(value.version) ? Number(value.version) : 0,
    publishedAt: nullableText(value.publishedAt),
    createdAt: nullableText(value.createdAt),
    updatedAt: nullableText(value.updatedAt),
  };
}

export function formatUpdatedAt(value: string | null) {
  if (!value) return "尚未儲存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function statusLabel(status: PageStatus) {
  if (status === "published") return "已發布";
  if (status === "archived") return "已封存";
  return "草稿";
}

export function formatContrastRatio(value: number) {
  return `${value.toFixed(2)}:1`;
}

export function settingsRevisionActor(value: string) {
  if (value === "local-preview") return "本機管理員";
  if (value === "catalog-seed" || value === "system") return "系統初始值";
  return value || "系統";
}
