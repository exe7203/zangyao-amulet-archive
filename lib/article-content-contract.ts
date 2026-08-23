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
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
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
export const ARTICLE_IMAGE_URL_MAX_LENGTH = 1000;
export const ARTICLE_IMAGE_ALT_MAX_LENGTH = 300;
export const ARTICLE_IMAGE_CAPTION_MAX_LENGTH = 500;
export const ARTICLE_TABLE_MAX_ROWS = 20;
export const ARTICLE_TABLE_MAX_COLUMNS = 8;
export const ARTICLE_TABLE_MAX_CELL_BLOCKS = 8;
export const ARTICLE_TABLE_MAX_CELL_TEXT_LENGTH = 2000;
export const ARTICLE_TABLE_MAX_TEXT_LENGTH = 12_000;
export const ARTICLE_TABLE_MAX_CONTENT_DEPTH = 8;
export const ARTICLE_PUBLISH_REQUIREMENTS = {
  excerptLength: 20,
  seoTitleLength: 8,
  seoDescriptionLength: 50,
  bodyTextLength: 300,
} as const;
export const ARTICLE_PUBLISH_ERROR_MESSAGE = `發布前請完成摘要（至少 ${ARTICLE_PUBLISH_REQUIREMENTS.excerptLength} 字）、SEO 標題（至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoTitleLength} 字）、SEO 描述（至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字）與正文（至少 ${ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength} 字）`;

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s<>]/u;
const IMAGE_URL_FORBIDDEN = /[\u0000-\u0020\u007f<>\\]/u;
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

export function safeArticleImageSrc(value: unknown): string | null {
  if (typeof value !== "string" || value.length > ARTICLE_IMAGE_URL_MAX_LENGTH) return null;
  const src = value.trim();
  if (!src || src.length > ARTICLE_IMAGE_URL_MAX_LENGTH || IMAGE_URL_FORBIDDEN.test(src)) return null;
  try {
    const url = new URL(src);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    const normalized = url.toString();
    return normalized.length <= ARTICLE_IMAGE_URL_MAX_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

export type SafeArticleImageAttributes = {
  src: string;
  alt: string;
  caption: string;
};

export function safeArticleImageAttributes(value: unknown): SafeArticleImageAttributes | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["src", "alt", "caption", "title", "width", "height"])) return null;
  const src = safeArticleImageSrc(value.src);
  const alt = typeof value.alt === "string" ? value.alt.trim() : "";
  const caption = value.caption === undefined || value.caption === null
    ? ""
    : typeof value.caption === "string" ? value.caption.trim() : null;
  if (!src || !alt || alt.length > ARTICLE_IMAGE_ALT_MAX_LENGTH || caption === null || caption.length > ARTICLE_IMAGE_CAPTION_MAX_LENGTH) return null;
  if (value.title !== undefined && value.title !== null) return null;
  if (value.width !== undefined && value.width !== null) return null;
  if (value.height !== undefined && value.height !== null) return null;
  return { src, alt, caption };
}

export function isArticleHeadingLevel(value: unknown): value is 2 | 3 | 4 {
  return ARTICLE_HEADING_LEVELS.some((level) => level === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function articleDocumentTextLength(value: unknown, depth = 0): number {
  if (depth > ARTICLE_MAX_DOCUMENT_DEPTH || !isRecord(value)) return 0;
  const ownText = typeof value.text === "string"
    ? Array.from(value.text.replace(/\s/gu, "")).length
    : 0;
  return ownText + (Array.isArray(value.content)
    ? value.content.reduce((sum, child) => sum + articleDocumentTextLength(child, depth + 1), 0)
    : 0);
}

export function evaluateArticlePublishReadiness(value: {
  excerpt: unknown;
  seoTitle: unknown;
  seoDescription: unknown;
  contentJson: unknown;
}) {
  const excerptLength = typeof value.excerpt === "string" ? value.excerpt.trim().length : 0;
  const seoTitleLength = typeof value.seoTitle === "string" ? value.seoTitle.trim().length : 0;
  const seoDescriptionLength = typeof value.seoDescription === "string" ? value.seoDescription.trim().length : 0;
  const bodyTextLength = articleDocumentTextLength(value.contentJson);
  const excerptReady = excerptLength >= ARTICLE_PUBLISH_REQUIREMENTS.excerptLength;
  const seoTitleReady = seoTitleLength >= ARTICLE_PUBLISH_REQUIREMENTS.seoTitleLength;
  const seoDescriptionReady = seoDescriptionLength >= ARTICLE_PUBLISH_REQUIREMENTS.seoDescriptionLength;
  const bodyReady = bodyTextLength >= ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength;
  return {
    excerptLength,
    seoTitleLength,
    seoDescriptionLength,
    bodyTextLength,
    excerptReady,
    seoTitleReady,
    seoDescriptionReady,
    bodyReady,
    ok: excerptReady && seoTitleReady && seoDescriptionReady && bodyReady,
  };
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
  if (type === "image") return safeArticleImageAttributes(attrs) !== null;
  if (type === "tableCell" || type === "tableHeader") {
    if (attrs === undefined) return true;
    if (!isRecord(attrs) || !hasOnlyKeys(attrs, ["colspan", "rowspan", "colwidth", "align"])) return false;
    return (attrs.colspan === undefined || attrs.colspan === 1) &&
      (attrs.rowspan === undefined || attrs.rowspan === 1) &&
      (attrs.colwidth === undefined || attrs.colwidth === null) &&
      (attrs.align === undefined || attrs.align === null);
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

type ArticleValidationContext = {
  parentType: string | null;
  tableRootDepth: number | null;
};

function validTableShape(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.content) || value.content.length < 1 || value.content.length > ARTICLE_TABLE_MAX_ROWS) return false;
  let columnCount = 0;
  let tableTextLength = 0;
  for (const [rowIndex, row] of value.content.entries()) {
    if (!isRecord(row) || row.type !== "tableRow" || !Array.isArray(row.content)) return false;
    if (row.content.length < 1 || row.content.length > ARTICLE_TABLE_MAX_COLUMNS) return false;
    if (!columnCount) columnCount = row.content.length;
    if (row.content.length !== columnCount) return false;
    const cellTypes = new Set(row.content.map((cell) => isRecord(cell) ? cell.type : ""));
    if (cellTypes.size !== 1 || (rowIndex > 0 && cellTypes.has("tableHeader"))) return false;
    for (const cell of row.content) {
      if (!isRecord(cell) || (cell.type !== "tableCell" && cell.type !== "tableHeader")) return false;
      if (!Array.isArray(cell.content) || cell.content.length < 1 || cell.content.length > ARTICLE_TABLE_MAX_CELL_BLOCKS) return false;
      if (!cell.content.every((block) => isRecord(block) && block.type === "paragraph")) return false;
      const cellTextLength = articleDocumentTextLength(cell);
      if (cellTextLength > ARTICLE_TABLE_MAX_CELL_TEXT_LENGTH) return false;
      tableTextLength += cellTextLength;
      if (tableTextLength > ARTICLE_TABLE_MAX_TEXT_LENGTH) return false;
    }
  }
  return true;
}

function validNodePlacement(type: string, depth: number, context: ArticleValidationContext): boolean {
  if (type === "doc") return depth === 0 && context.parentType === null;
  if (type === "tableRow") return context.parentType === "table";
  if (type === "tableCell" || type === "tableHeader") return context.parentType === "tableRow";
  if (context.parentType === "table") return type === "tableRow";
  if (context.parentType === "tableRow") return type === "tableCell" || type === "tableHeader";
  if (context.parentType === "paragraph" || context.parentType === "heading") {
    return type === "text" || type === "hardBreak";
  }
  if (context.parentType === "codeBlock") return type === "text";
  return true;
}

function validateArticleNode(
  value: unknown,
  depth: number,
  state: { count: number },
  context: ArticleValidationContext,
): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !ARTICLE_NODE_TYPES.includes(value.type as (typeof ARTICLE_NODE_TYPES)[number])) return false;
  const nodeType = value.type;
  if (!hasOnlyKeys(value, ["type", "text", "attrs", "content", "marks"])) return false;
  if (depth > ARTICLE_MAX_DOCUMENT_DEPTH || ++state.count > ARTICLE_MAX_NODE_COUNT) return false;
  if (!validNodePlacement(value.type, depth, context)) return false;
  if (context.tableRootDepth !== null && depth - context.tableRootDepth > ARTICLE_TABLE_MAX_CONTENT_DEPTH) return false;

  if (value.type === "table") {
    if (context.tableRootDepth !== null || !validTableShape(value)) return false;
  }
  if ((value.type === "image" || value.type === "hardBreak" || value.type === "horizontalRule") && value.content !== undefined) return false;

  if (value.type === "text") {
    if (typeof value.text !== "string" || value.content !== undefined) return false;
  } else if (value.text !== undefined) {
    return false;
  }
  if (!validNodeAttributes(value.type, value.attrs)) return false;

  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return false;
    const tableRootDepth = value.type === "table" ? depth : context.tableRootDepth;
    if (!value.content.every((child) => validateArticleNode(child, depth + 1, state, {
      parentType: nodeType,
      tableRootDepth,
    }))) return false;
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
  return isRecord(value) && value.type === "doc" && validateArticleNode(value, 0, { count: 0 }, {
    parentType: null,
    tableRootDepth: null,
  });
}

export function validateArticleTableNode(value: unknown): boolean {
  return isRecord(value) && value.type === "table" && validateArticleNode(value, 0, { count: 0 }, {
    parentType: "doc",
    tableRootDepth: null,
  });
}

export function articleHrefForPublicSite(value: unknown, basePath = ""): string | null {
  const href = safeArticleLinkHref(value);
  if (!href || !href.startsWith("/") || href.startsWith("//")) return href;
  const normalizedBasePath = basePath.trim().replace(/^\/*|\/*$/gu, "");
  return normalizedBasePath ? `/${normalizedBasePath}${href}` : href;
}
