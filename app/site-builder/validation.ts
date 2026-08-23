import { createStarterPageData, type PageData } from "./types";
import { ARTICLE_PUBLISH_REQUIREMENTS } from "../../lib/article-content-contract";

export const MAX_PAGE_DATA_BYTES = 512_000;
export const MAX_PAGE_BLOCKS = 40;
export const PAGE_SEO_PUBLISH_REQUIREMENTS = {
  seoTitleLength: ARTICLE_PUBLISH_REQUIREMENTS.seoTitleLength,
  seoDescriptionLength: ARTICLE_PUBLISH_REQUIREMENTS.seoDescriptionLength,
} as const;

export function evaluatePageSeoPublishReadiness(value: {
  seoTitle: unknown;
  seoDescription: unknown;
}) {
  const seoTitleLength = typeof value.seoTitle === "string" ? value.seoTitle.trim().length : 0;
  const seoDescriptionLength = typeof value.seoDescription === "string" ? value.seoDescription.trim().length : 0;
  const seoTitleReady = seoTitleLength >= PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength;
  const seoDescriptionReady = seoDescriptionLength >= PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength;
  return {
    seoTitleLength,
    seoDescriptionLength,
    seoTitleReady,
    seoDescriptionReady,
    ok: seoTitleReady && seoDescriptionReady,
  };
}

const allowedTypes = new Set([
  "Hero",
  "Text",
  "ImageFeature",
  "Features",
  "FAQ",
  "CTA",
  "ProductShowcase",
  "ArticleShowcase",
]);
const sectionTones = new Set(["paper", "ivory", "ink", "gold"]);
const reservedSlugs = new Set([
  "admin",
  "api",
  "articles",
  "products",
  "service",
  "_vinext",
  "signin-with-chatgpt",
  "signout-with-chatgpt",
  "callback",
]);

type ValidationResult =
  | { ok: true; data: PageData; issues: [] }
  | { ok: false; data: null; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function stringField(
  props: Record<string, unknown>,
  key: string,
  max: number,
  issues: string[],
  required = false,
) {
  const value = props[key];
  if (typeof value !== "string") {
    issues.push(`${key} 必須是文字`);
    return;
  }
  if (required && !value.trim()) issues.push(`${key} 不可空白`);
  if (value.length > max) issues.push(`${key} 不可超過 ${max} 字元`);
}

function isSafeLink(value: string) {
  if (!value) return true;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && (url.username || url.password)) return false;
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isSafeImage(value: string) {
  if (!value) return true;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateTone(props: Record<string, unknown>, issues: string[]) {
  if (typeof props.tone !== "string" || !sectionTones.has(props.tone)) {
    issues.push("tone 不是允許的版面色調");
  }
}

function validateLink(props: Record<string, unknown>, key: string, issues: string[]) {
  stringField(props, key, 1000, issues);
  if (typeof props[key] === "string" && !isSafeLink(props[key])) {
    issues.push(`${key} 只接受站內路徑、錨點、http(s) 或 mailto`);
  }
}

function validateFeatureItems(value: unknown, issues: string[]) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    issues.push("Features items 必須包含 1 至 8 項");
    return;
  }
  value.forEach((item, index) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ["title", "body"])) {
      issues.push(`Features 第 ${index + 1} 項格式不正確`);
      return;
    }
    stringField(item, "title", 100, issues, true);
    stringField(item, "body", 400, issues, true);
  });
}

function validateFaqItems(value: unknown, issues: string[]) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    issues.push("FAQ items 必須包含 1 至 12 項");
    return;
  }
  value.forEach((item, index) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ["question", "answer"])) {
      issues.push(`FAQ 第 ${index + 1} 項格式不正確`);
      return;
    }
    stringField(item, "question", 160, issues, true);
    stringField(item, "answer", 800, issues, true);
  });
}

function validateBlock(block: unknown, index: number, issues: string[]) {
  if (!isRecord(block) || typeof block.type !== "string" || !allowedTypes.has(block.type)) {
    issues.push(`第 ${index + 1} 個區塊類型不被允許`);
    return;
  }
  if (!hasOnlyKeys(block, ["type", "props", "readOnly"]) || !isRecord(block.props)) {
    issues.push(`第 ${index + 1} 個區塊格式不正確`);
    return;
  }
  if (block.readOnly !== undefined &&
    (!isRecord(block.readOnly) || Object.values(block.readOnly).some((value) => typeof value !== "boolean"))) {
    issues.push(`第 ${index + 1} 個區塊 readOnly 格式不正確`);
  }

  const props = block.props;
  stringField(props, "id", 120, issues, true);
  validateTone(props, issues);

  const common = ["id", "eyebrow", "title", "tone"];
  stringField(props, "eyebrow", 80, issues);
  stringField(props, "title", 180, issues, true);

  if (block.type === "Hero") {
    if (!hasOnlyKeys(props, [...common, "description", "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref"])) issues.push("Hero 含有未允許欄位");
    stringField(props, "description", 500, issues);
    stringField(props, "primaryLabel", 60, issues);
    validateLink(props, "primaryHref", issues);
    stringField(props, "secondaryLabel", 60, issues);
    validateLink(props, "secondaryHref", issues);
  } else if (block.type === "Text") {
    if (!hasOnlyKeys(props, [...common, "body", "alignment"])) issues.push("Text 含有未允許欄位");
    stringField(props, "body", 8_000, issues, true);
    if (props.alignment !== "left" && props.alignment !== "center") issues.push("Text alignment 不正確");
  } else if (block.type === "ImageFeature") {
    if (!hasOnlyKeys(props, [...common, "body", "imageUrl", "imageAlt", "imagePosition", "buttonLabel", "buttonHref"])) issues.push("ImageFeature 含有未允許欄位");
    stringField(props, "body", 2_000, issues);
    stringField(props, "imageUrl", 1000, issues);
    if (typeof props.imageUrl === "string" && !isSafeImage(props.imageUrl)) issues.push("imageUrl 只接受站內路徑或 http(s)");
    stringField(props, "imageAlt", 180, issues, Boolean(props.imageUrl));
    if (props.imagePosition !== "left" && props.imagePosition !== "right") issues.push("imagePosition 不正確");
    stringField(props, "buttonLabel", 60, issues);
    validateLink(props, "buttonHref", issues);
  } else if (block.type === "Features") {
    if (!hasOnlyKeys(props, [...common, "intro", "items", "columns"])) issues.push("Features 含有未允許欄位");
    stringField(props, "intro", 500, issues);
    validateFeatureItems(props.items, issues);
    if (!["2", "3", "4"].includes(String(props.columns))) issues.push("Features columns 不正確");
  } else if (block.type === "FAQ") {
    if (!hasOnlyKeys(props, [...common, "intro", "items"])) issues.push("FAQ 含有未允許欄位");
    stringField(props, "intro", 500, issues);
    validateFaqItems(props.items, issues);
  } else if (block.type === "CTA") {
    if (!hasOnlyKeys(props, [...common, "body", "buttonLabel", "buttonHref"])) issues.push("CTA 含有未允許欄位");
    stringField(props, "body", 1000, issues);
    stringField(props, "buttonLabel", 60, issues, true);
    validateLink(props, "buttonHref", issues);
  } else if (block.type === "ProductShowcase") {
    if (!hasOnlyKeys(props, [...common, "intro", "category", "limit", "viewAllLabel", "viewAllHref"])) issues.push("ProductShowcase 含有未允許欄位");
    stringField(props, "intro", 500, issues);
    stringField(props, "category", 80, issues, true);
    if (!["3", "4", "6", "8"].includes(String(props.limit))) issues.push("商品顯示數量不正確");
    stringField(props, "viewAllLabel", 60, issues);
    validateLink(props, "viewAllHref", issues);
  } else if (block.type === "ArticleShowcase") {
    if (!hasOnlyKeys(props, [...common, "intro", "limit", "viewAllLabel", "viewAllHref"])) issues.push("ArticleShowcase 含有未允許欄位");
    stringField(props, "intro", 500, issues);
    if (!["3", "4", "6"].includes(String(props.limit))) issues.push("文章顯示數量不正確");
    stringField(props, "viewAllLabel", 60, issues);
    validateLink(props, "viewAllHref", issues);
  }
}

export function validatePageData(value: unknown): ValidationResult {
  const issues: string[] = [];
  if (!isRecord(value) || !isRecord(value.root) || !Array.isArray(value.content)) {
    return { ok: false, data: null, issues: ["頁面資料缺少 root 或 content"] };
  }
  const serializedBytes = byteLength(value);
  if (serializedBytes === null) issues.push("頁面資料無法安全序列化");
  else if (serializedBytes > MAX_PAGE_DATA_BYTES) issues.push("頁面資料超過 512 KB");
  if (value.content.length > MAX_PAGE_BLOCKS) issues.push(`頁面最多 ${MAX_PAGE_BLOCKS} 個區塊`);
  if (!hasOnlyKeys(value, ["root", "content", "zones"])) issues.push("頁面資料含有未允許的根欄位");
  if (!hasOnlyKeys(value.root, ["props", "readOnly"])) issues.push("頁面 root 含有未允許欄位");
  if (value.root.props !== undefined) {
    if (!isRecord(value.root.props) || !hasOnlyKeys(value.root.props, ["title"])) {
      issues.push("頁面 root props 格式不正確");
    } else if (value.root.props.title !== undefined &&
      (typeof value.root.props.title !== "string" || value.root.props.title.length > 180)) {
      issues.push("頁面 root title 格式不正確");
    }
  }
  if (value.root.readOnly !== undefined &&
    (!isRecord(value.root.readOnly) ||
      !hasOnlyKeys(value.root.readOnly, ["title"]) ||
      Object.values(value.root.readOnly).some((entry) => typeof entry !== "boolean"))) {
    issues.push("頁面 root readOnly 格式不正確");
  }
  if (value.zones !== undefined && (!isRecord(value.zones) || Object.keys(value.zones).length > 0)) {
    issues.push("目前版型不允許自訂巢狀區域");
  }
  const blockIds = new Set<string>();
  value.content.forEach((block, index) => {
    validateBlock(block, index, issues);
    const id = isRecord(block) && isRecord(block.props) && typeof block.props.id === "string"
      ? block.props.id
      : "";
    if (id && blockIds.has(id)) issues.push(`第 ${index + 1} 個區塊識別碼重複`);
    if (id) blockIds.add(id);
  });
  return issues.length > 0
    ? { ok: false, data: null, issues }
    : { ok: true, data: value as PageData, issues: [] };
}

export function normalizePageData(value: unknown): PageData {
  const result = validatePageData(value);
  return result.ok ? result.data : createStarterPageData();
}

export function normalizePageSlug(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function isReservedPageSlug(slug: string) {
  return reservedSlugs.has(normalizePageSlug(slug));
}
