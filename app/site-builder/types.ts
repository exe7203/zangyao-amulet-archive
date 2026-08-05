import type { Data } from "@puckeditor/core";

export type SectionTone = "paper" | "ivory" | "ink" | "gold";
export type TextAlignment = "left" | "center";

export type FeatureItem = {
  title: string;
  body: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type PageComponents = {
  Hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    tone: SectionTone;
  };
  Text: {
    eyebrow: string;
    title: string;
    body: string;
    alignment: TextAlignment;
    tone: SectionTone;
  };
  ImageFeature: {
    eyebrow: string;
    title: string;
    body: string;
    imageUrl: string;
    imageAlt: string;
    imagePosition: "left" | "right";
    buttonLabel: string;
    buttonHref: string;
    tone: SectionTone;
  };
  Features: {
    eyebrow: string;
    title: string;
    intro: string;
    items: FeatureItem[];
    columns: "2" | "3" | "4";
    tone: SectionTone;
  };
  FAQ: {
    eyebrow: string;
    title: string;
    intro: string;
    items: FaqItem[];
    tone: SectionTone;
  };
  CTA: {
    eyebrow: string;
    title: string;
    body: string;
    buttonLabel: string;
    buttonHref: string;
    tone: SectionTone;
  };
  ProductShowcase: {
    eyebrow: string;
    title: string;
    intro: string;
    category: "all" | "佛牌" | "神尊" | "符印";
    limit: "3" | "4" | "6" | "8";
    viewAllLabel: string;
    viewAllHref: string;
    tone: SectionTone;
  };
  ArticleShowcase: {
    eyebrow: string;
    title: string;
    intro: string;
    limit: "3" | "4" | "6";
    viewAllLabel: string;
    viewAllHref: string;
    tone: SectionTone;
  };
};

export type PageData = Data<PageComponents>;
export type PageStatus = "draft" | "published" | "archived";

export type PageRecord = {
  id: string;
  slug: string;
  title: string;
  data: PageData;
  status: PageStatus;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  noindex: boolean;
  version: number;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ShowcaseProduct = {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  category?: string;
  origin?: string;
  material?: string;
  price?: number;
  stock?: number;
  status?: string;
  imageUrl?: string;
  imageAlt?: string;
};

export type ShowcaseArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  tag?: string;
  status?: string;
  noindex?: boolean;
};

export type PageRenderMetadata = {
  products?: ShowcaseProduct[];
  articles?: ShowcaseArticle[];
  preview?: boolean;
};

export function createStarterPageData(): PageData {
  return {
    root: {},
    content: [
      {
        type: "Hero",
        props: {
          // Deterministic starter ids keep server rendering and hydration stable.
          // Puck generates unique ids for blocks inserted later by the editor.
          id: "starter-hero",
          eyebrow: "TAIJUDA COLLECTION",
          title: "替這個頁面寫下一句清楚的主張。",
          description: "用一至兩句話說明這個系列、專題或服務，讓訪客立即知道下一步。",
          primaryLabel: "開始探索",
          primaryHref: "#content",
          secondaryLabel: "聯絡我們",
          secondaryHref: "/service/contact/",
          tone: "ink",
        },
      },
      {
        type: "Features",
        props: {
          id: "starter-features",
          eyebrow: "WHY IT MATTERS",
          title: "重要資訊一眼就能看懂",
          intro: "保留真正能幫助訪客做決定的內容。",
          items: [
            { title: "來源清楚", body: "把已知資料、實物紀錄與待確認資訊分開呈現。" },
            { title: "內容可讀", body: "讓第一次接觸的人也能理解年份、材質與收藏方式。" },
            { title: "行動明確", body: "每個頁面只保留一個主要下一步。" },
          ],
          columns: "3",
          tone: "paper",
        },
      },
      {
        type: "CTA",
        props: {
          id: "starter-cta",
          eyebrow: "NEXT STEP",
          title: "準備好下一步了嗎？",
          body: "前往商品區瀏覽目前可訂藏品，或先與我們確認細節。",
          buttonLabel: "查看最新商品",
          buttonHref: "/#new",
          tone: "gold",
        },
      },
    ],
  };
}

export function createEmptyPageRecord(): PageRecord {
  return {
    id: "",
    slug: "",
    title: "",
    data: createStarterPageData(),
    status: "draft",
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    ogImageUrl: "",
    noindex: false,
    version: 0,
    publishedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}
