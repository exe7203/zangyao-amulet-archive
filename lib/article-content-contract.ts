export const ARTICLE_NODE_TYPES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
] as const;

export const ARTICLE_MARK_TYPES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
] as const;

export const ARTICLE_HEADING_LEVELS = [2, 3, 4] as const;
export const ARTICLE_MAX_DOCUMENT_DEPTH = 24;
export const ARTICLE_MAX_NODE_COUNT = 5000;

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s<>]/u;
const MAILTO_PATTERN = /^mailto:[^\s@]+@[^\s@]+$/iu;
const TELEPHONE_PATTERN = /^tel:\+?[0-9()\-\s]{6,24}$/iu;

export function safeArticleLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || CONTROL_OR_SPACE.test(href)) return null;

  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (MAILTO_PATTERN.test(href) || TELEPHONE_PATTERN.test(href)) return href;

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isArticleHeadingLevel(value: unknown): value is 2 | 3 | 4 {
  return ARTICLE_HEADING_LEVELS.some((level) => level === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validNodeAttributes(type: string, attrs: unknown) {
  if (type === "heading") {
    return isRecord(attrs) && hasOnlyKeys(attrs, ["level"]) && isArticleHeadingLevel(attrs.level);
  }
  if (type === "orderedList") {
    if (attrs === undefined) return true;
    return isRecord(attrs) && hasOnlyKeys(attrs, ["start", "type"]) && attrs.start === 1 && attrs.type === null;
  }
  if (type === "codeBlock") {
    if (attrs === undefined) return true;
    if (!isRecord(attrs) || !hasOnlyKeys(attrs, ["language"])) return false;
    return attrs.language === null || (typeof attrs.language === "string" && attrs.language.length <= 40);
  }
  return attrs === undefined || (isRecord(attrs) && Object.keys(attrs).length === 0);
}

function validMarkAttributes(type: string, attrs: unknown) {
  if (type !== "link") {
    return attrs === undefined || (isRecord(attrs) && Object.keys(attrs).length === 0);
  }
  if (!isRecord(attrs) || !hasOnlyKeys(attrs, ["href", "target", "rel", "class", "title"])) return false;
  if (!safeArticleLinkHref(attrs.href)) return false;
  if (attrs.target !== undefined && attrs.target !== null && attrs.target !== "_blank") return false;
  if (attrs.rel !== undefined && attrs.rel !== null && (typeof attrs.rel !== "string" || attrs.rel.length > 100)) return false;
  if (attrs.class !== undefined && attrs.class !== null) return false;
  return attrs.title === undefined || attrs.title === null || (typeof attrs.title === "string" && attrs.title.length <= 300);
}

function validateArticleNode(value: unknown, depth: number, state: { count: number }): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !ARTICLE_NODE_TYPES.includes(value.type as (typeof ARTICLE_NODE_TYPES)[number])) return false;
  if (!hasOnlyKeys(value, ["type", "text", "attrs", "content", "marks"])) return false;
  if (depth > ARTICLE_MAX_DOCUMENT_DEPTH || ++state.count > ARTICLE_MAX_NODE_COUNT) return false;

  if (value.type === "text") {
    if (typeof value.text !== "string" || value.content !== undefined) return false;
  } else if (value.text !== undefined) {
    return false;
  }
  if (!validNodeAttributes(value.type, value.attrs)) return false;

  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return false;
    if (!value.content.every((child) => validateArticleNode(child, depth + 1, state))) return false;
  }

  if (value.marks !== undefined) {
    if (value.type !== "text" || !Array.isArray(value.marks)) return false;
    for (const mark of value.marks) {
      if (!isRecord(mark) || typeof mark.type !== "string" || !ARTICLE_MARK_TYPES.includes(mark.type as (typeof ARTICLE_MARK_TYPES)[number])) return false;
      if (!hasOnlyKeys(mark, ["type", "attrs"]) || !validMarkAttributes(mark.type, mark.attrs)) return false;
    }
  }
  return true;
}

export function validateArticleDocument(value: unknown): boolean {
  return isRecord(value) && value.type === "doc" && validateArticleNode(value, 0, { count: 0 });
}

export function articleHrefForPublicSite(value: unknown, basePath = ""): string | null {
  const href = safeArticleLinkHref(value);
  if (!href || !href.startsWith("/") || href.startsWith("//")) return href;
  const normalizedBasePath = basePath.trim().replace(/^\/*|\/*$/gu, "");
  return normalizedBasePath ? `/${normalizedBasePath}${href}` : href;
}
