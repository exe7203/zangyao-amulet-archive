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
  noindex: boolean;
  keywords: string[];
};

export type JournalLoadState = "loading" | "fallback" | "published" | "empty" | "error";

export type JournalApiResult = {
  state: Exclude<JournalLoadState, "loading">;
  articles: JournalArticle[];
};

const artStyles: ArticleArt[] = ["paper", "case", "stamp"];

export const fallbackArticles: JournalArticle[] = [
  {
    id: "guide-first-amulet",
    slug: "guide-first-amulet",
    title: "第一次接觸泰國佛牌：先看懂年份、材質與來源",
    excerpt: "先從可以查證的資料開始，建立自己的收藏判斷方式。",
    status: "published",
    publishedAt: null,
    updatedAt: null,
    tag: "新手指南",
    time: "07 MIN READ",
    art: "paper",
    seoTitle: "第一次接觸泰國佛牌：年份、材質與來源指南",
    seoDescription: "第一次接觸泰國佛牌，先學會核對佛曆年份、材質、尺寸、實拍與寺院來源，建立可以查證且不依賴傳聞的收藏判斷方式。",
    canonicalUrl: "",
    ogImageUrl: "og.png",
    noindex: false,
    keywords: ["泰國佛牌入門", "佛牌年份", "佛牌材質", "佛牌來源"],
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "先從可以查證的資訊開始" }] },
        { type: "paragraph", content: [{ type: "text", text: "第一次接觸佛牌時，不必先追求神奇說法。年份、材質、尺寸、寺院或法會來源，才是能夠被記錄與交叉確認的基礎。" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "確認佛曆與西元年份是否對得上。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "查看正反面、側邊與尺寸比例的實拍。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "把來源不確定的地方清楚標示，不用故事填補空白。" }] }] },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "收藏的第一步，是知道自己手上的資料有哪些、還缺哪些。" }] },
      ],
    },
  },
  {
    id: "amulet-case-care",
    slug: "amulet-case-care",
    title: "佛牌外殼只是保護嗎？常見材質與收藏方式",
    excerpt: "從日常配戴到長期保存，外殼與環境都會影響藏品狀態。",
    status: "published",
    publishedAt: null,
    updatedAt: null,
    tag: "收藏保養",
    time: "05 MIN READ",
    art: "case",
    seoTitle: "佛牌外殼材質與收藏保養方式",
    seoDescription: "認識防水殼、壓克力殼與金屬框的差異，以及粉質、老件佛牌在日常配戴與長期收藏時應注意的保存環境與檢查方式。",
    canonicalUrl: "",
    ogImageUrl: "og.png",
    noindex: false,
    keywords: ["佛牌外殼", "佛牌保存", "佛牌保養", "佛牌收藏"],
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "外殼是保護，也是保存環境的一部分" }] },
        { type: "paragraph", content: [{ type: "text", text: "防水殼、壓克力殼與金屬框各有不同的密合方式。選擇時應先看佛牌材質是否怕潮、是否容易掉粉，以及日常配戴情境。" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "老件或粉質藏品若已有裂紋，重新包殼前應先留下完整影像紀錄。" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "長期收藏時，避免高溫、潮濕與陽光直射，並定期檢查殼內是否有霧氣或異常變化。" }] },
      ],
    },
  },
  {
    id: "provenance-record",
    slug: "provenance-record",
    title: "從寺廟到收藏櫃：一件聖物的履歷應包含什麼？",
    excerpt: "把取得、轉手與保存資訊留下來，讓下一位收藏者也看得懂。",
    status: "published",
    publishedAt: null,
    updatedAt: null,
    tag: "來源紀錄",
    time: "08 MIN READ",
    art: "stamp",
    seoTitle: "佛牌來源與收藏履歷應記錄哪些資料？",
    seoDescription: "整理佛牌與聖物的寺院、師父、法會、年份、材質、尺寸、取得與轉手紀錄，並把已知證據和待確認資訊分開保存。",
    canonicalUrl: "",
    ogImageUrl: "og.png",
    noindex: false,
    keywords: ["佛牌來源", "佛牌履歷", "聖物收藏", "佛牌真偽紀錄"],
    contentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "一份可閱讀的藏品履歷" }] },
        { type: "paragraph", content: [{ type: "text", text: "完整履歷不等於保證真偽，而是把現有證據、來源說法與待確認項目分開記錄。" }] },
        { type: "orderedList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "寺院、師父、法會與年份資料。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "材質、尺寸、模具特徵與保存狀態。" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "取得方式、實拍日期與後續轉手紀錄。" }] }] },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "能誠實呈現未知，通常比一個過度完整的故事更值得信任。" }] },
      ],
    },
  },
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractTiptapText(value: unknown, depth = 0): string {
  if (depth > 24 || !isRecord(value)) return "";
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content)
    ? value.content.map((child) => extractTiptapText(child, depth + 1)).join("")
    : "";
  return ownText + childText;
}

export function estimateReadingTime(contentJson: unknown): string {
  const characterCount = extractTiptapText(contentJson).replace(/\s/g, "").length;
  return `${String(Math.max(1, Math.ceil(characterCount / 350))).padStart(2, "0")} MIN READ`;
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
    tag: "收藏誌",
    time: estimateReadingTime(value.contentJson),
    art: artStyles[index % artStyles.length],
    seoTitle: cleanString(value.seoTitle),
    seoDescription: cleanString(value.seoDescription),
    canonicalUrl: cleanString(value.canonicalUrl),
    ogImageUrl: cleanString(value.ogImageUrl),
    noindex: value.noindex === true,
    keywords: [],
  };
}

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
