import type { Config } from "@puckeditor/core";
import {
  ArticleShowcaseBlock,
  CtaBlock,
  FaqBlock,
  FeaturesBlock,
  HeroBlock,
  ImageFeatureBlock,
  ProductShowcaseBlock,
  TextBlock,
} from "./blocks";
import type { PageComponents, PageRenderMetadata } from "./types";

const toneField = {
  type: "select" as const,
  label: "區塊色調",
  options: [
    { label: "紙白", value: "paper" },
    { label: "暖灰", value: "ivory" },
    { label: "深墨", value: "ink" },
    { label: "金色", value: "gold" },
  ],
};

export const pageBuilderConfig: Config<PageComponents> = {
  categories: {
    content: { title: "品牌內容", components: ["Hero", "Text", "ImageFeature", "Features", "FAQ", "CTA"], defaultExpanded: true },
    dynamic: { title: "動態內容", components: ["ProductShowcase", "ArticleShowcase"], defaultExpanded: true },
  },
  components: {
    Hero: {
      label: "首屏主視覺",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "textarea", label: "主標題（H1）", contentEditable: true },
        description: { type: "textarea", label: "說明", contentEditable: true },
        primaryLabel: { type: "text", label: "主要按鈕文字" },
        primaryHref: { type: "text", label: "主要按鈕網址" },
        secondaryLabel: { type: "text", label: "次要連結文字" },
        secondaryHref: { type: "text", label: "次要連結網址" },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "TAIJUDA COLLECTION",
        title: "替這個頁面寫下一句清楚的主張。",
        description: "用一至兩句話說明這個系列、專題或服務。",
        primaryLabel: "開始探索",
        primaryHref: "#content",
        secondaryLabel: "聯絡我們",
        secondaryHref: "/service/contact/",
        tone: "ink",
      },
      render: ({ eyebrow, title, description, primaryLabel, primaryHref, secondaryLabel, secondaryHref, tone }) => (
        <HeroBlock {...{ eyebrow, title, description, primaryLabel, primaryHref, secondaryLabel, secondaryHref, tone }} />
      ),
    },
    Text: {
      label: "純文字內容",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "段落標題", contentEditable: true },
        body: { type: "textarea", label: "內文", contentEditable: true },
        alignment: { type: "radio", label: "對齊", options: [{ label: "靠左", value: "left" }, { label: "置中", value: "center" }] },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "OUR POINT OF VIEW",
        title: "讓內容替品牌建立信任",
        body: "這裡適合放品牌理念、系列背景或需要被完整說清楚的一段內容。\n文字只會以純文字顯示，不接受任意 HTML 或程式碼。",
        alignment: "left",
        tone: "paper",
      },
      render: ({ eyebrow, title, body, alignment, tone }) => <TextBlock {...{ eyebrow, title, body, alignment, tone }} />,
    },
    ImageFeature: {
      label: "圖文介紹",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        body: { type: "textarea", label: "內文", contentEditable: true },
        imageUrl: { type: "text", label: "圖片網址" },
        imageAlt: { type: "text", label: "圖片替代文字（SEO／無障礙）" },
        imagePosition: { type: "radio", label: "圖片位置", options: [{ label: "左側", value: "left" }, { label: "右側", value: "right" }] },
        buttonLabel: { type: "text", label: "按鈕文字" },
        buttonHref: { type: "text", label: "按鈕網址" },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "FEATURE STORY",
        title: "用一張圖片說明系列重點",
        body: "可放入公開圖片網址，並務必填寫能描述畫面的替代文字。",
        imageUrl: "",
        imageAlt: "",
        imagePosition: "left",
        buttonLabel: "了解更多",
        buttonHref: "/about/",
        tone: "ivory",
      },
      render: ({ eyebrow, title, body, imageUrl, imageAlt, imagePosition, buttonLabel, buttonHref, tone }) => (
        <ImageFeatureBlock {...{ eyebrow, title, body, imageUrl, imageAlt, imagePosition, buttonLabel, buttonHref, tone }} />
      ),
    },
    Features: {
      label: "重點特色",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        intro: { type: "textarea", label: "引言", contentEditable: true },
        items: {
          type: "array",
          label: "特色項目",
          min: 1,
          max: 8,
          arrayFields: {
            title: { type: "text", label: "項目標題", contentEditable: true },
            body: { type: "textarea", label: "項目說明", contentEditable: true },
          },
          defaultItemProps: (index) => ({ title: `重點 ${index + 1}`, body: "說明這項內容為什麼重要。" }),
          getItemSummary: (item, index) => item.title || `重點 ${(index || 0) + 1}`,
        },
        columns: { type: "select", label: "桌面欄數", options: [{ label: "2 欄", value: "2" }, { label: "3 欄", value: "3" }, { label: "4 欄", value: "4" }] },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "WHY IT MATTERS",
        title: "重要資訊一眼就能看懂",
        intro: "保留真正能幫助訪客做決定的內容。",
        items: [
          { title: "來源清楚", body: "把已知資料與待確認資訊分開呈現。" },
          { title: "內容可讀", body: "讓第一次接觸的人也能理解。" },
          { title: "行動明確", body: "每個頁面只保留一個主要下一步。" },
        ],
        columns: "3",
        tone: "paper",
      },
      render: ({ eyebrow, title, intro, items, columns, tone }) => <FeaturesBlock {...{ eyebrow, title, intro, items, columns, tone }} />,
    },
    FAQ: {
      label: "常見問題",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        intro: { type: "textarea", label: "引言", contentEditable: true },
        items: {
          type: "array",
          label: "問答",
          min: 1,
          max: 12,
          arrayFields: {
            question: { type: "text", label: "問題", contentEditable: true },
            answer: { type: "textarea", label: "回答", contentEditable: true },
          },
          defaultItemProps: (index) => ({ question: `常見問題 ${index + 1}`, answer: "用簡單、可查證的方式回答。" }),
          getItemSummary: (item, index) => item.question || `問答 ${(index || 0) + 1}`,
        },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "FAQ",
        title: "常見問題",
        intro: "先回答訪客在採取下一步前最常遇到的疑問。",
        items: [
          { question: "這個頁面適合放什麼？", answer: "適合放系列介紹、活動專頁、服務說明或主題內容。" },
          { question: "內容會被搜尋引擎看見嗎？", answer: "發布並同步至公開快照後，內容會以完整 HTML 輸出。" },
        ],
        tone: "ivory",
      },
      render: ({ eyebrow, title, intro, items, tone }) => <FaqBlock {...{ eyebrow, title, intro, items, tone }} />,
    },
    CTA: {
      label: "行動呼籲",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        body: { type: "textarea", label: "說明", contentEditable: true },
        buttonLabel: { type: "text", label: "按鈕文字" },
        buttonHref: { type: "text", label: "按鈕網址" },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "NEXT STEP",
        title: "準備好下一步了嗎？",
        body: "把訪客帶到最重要的下一個動作。",
        buttonLabel: "查看最新商品",
        buttonHref: "/#new",
        tone: "gold",
      },
      render: ({ eyebrow, title, body, buttonLabel, buttonHref, tone }) => <CtaBlock {...{ eyebrow, title, body, buttonLabel, buttonHref, tone }} />,
    },
    ProductShowcase: {
      label: "商品展示",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        intro: { type: "textarea", label: "引言", contentEditable: true },
        category: { type: "select", label: "商品分類", options: [{ label: "全部", value: "all" }, { label: "佛牌", value: "佛牌" }, { label: "神尊", value: "神尊" }, { label: "符印", value: "符印" }] },
        limit: { type: "select", label: "顯示數量", options: [{ label: "3 件", value: "3" }, { label: "4 件", value: "4" }, { label: "6 件", value: "6" }, { label: "8 件", value: "8" }] },
        viewAllLabel: { type: "text", label: "查看全部文字" },
        viewAllHref: { type: "text", label: "查看全部網址" },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "NEW ARRIVALS",
        title: "最新商品",
        intro: "商品內容使用目前已發布的商品資料，不在頁面編輯器重複維護。",
        category: "all",
        limit: "4",
        viewAllLabel: "查看全部商品",
        viewAllHref: "/#new",
        tone: "ivory",
      },
      render: ({ puck, eyebrow, title, intro, category, limit, viewAllLabel, viewAllHref, tone }) => {
        const metadata = puck.metadata as PageRenderMetadata;
        return <ProductShowcaseBlock {...{ eyebrow, title, intro, category, limit, viewAllLabel, viewAllHref, tone }} products={metadata.products} />;
      },
    },
    ArticleShowcase: {
      label: "文章展示",
      fields: {
        eyebrow: { type: "text", label: "眉題", contentEditable: true },
        title: { type: "text", label: "標題", contentEditable: true },
        intro: { type: "textarea", label: "引言", contentEditable: true },
        limit: { type: "select", label: "顯示數量", options: [{ label: "3 篇", value: "3" }, { label: "4 篇", value: "4" }, { label: "6 篇", value: "6" }] },
        viewAllLabel: { type: "text", label: "查看全部文字" },
        viewAllHref: { type: "text", label: "查看全部網址" },
        tone: toneField,
      },
      defaultProps: {
        eyebrow: "JOURNAL",
        title: "佛牌專欄",
        intro: "文章內容由已發布的文章快照帶入。",
        limit: "3",
        viewAllLabel: "閱讀所有文章",
        viewAllHref: "/#journal",
        tone: "paper",
      },
      render: ({ puck, eyebrow, title, intro, limit, viewAllLabel, viewAllHref, tone }) => {
        const metadata = puck.metadata as PageRenderMetadata;
        return <ArticleShowcaseBlock {...{ eyebrow, title, intro, limit, viewAllLabel, viewAllHref, tone }} articles={metadata.articles} />;
      },
    },
  },
};

export const editorPreviewMetadata: PageRenderMetadata = {
  preview: true,
  products: [
    { id: "preview-product-1", slug: "preview-product-1", name: "崇迪佛牌・經典粉質小模", category: "佛牌", origin: "曼谷地區", material: "粉質", price: 3680, stock: 3, status: "active" },
    { id: "preview-product-2", slug: "preview-product-2", name: "必打佛・黑色粉質版", category: "佛牌", origin: "北欖府", material: "混合聖粉", price: 4280, stock: 1, status: "active" },
    { id: "preview-product-3", slug: "preview-product-3", name: "四面神・金屬彩釉小尊", category: "神尊", origin: "曼谷地區", material: "黃銅彩釉", price: 4680, stock: 2, status: "active" },
    { id: "preview-product-4", slug: "preview-product-4", name: "哈奴曼・銀色符印版", category: "符印", origin: "佛統府", material: "白色合金", price: 5280, stock: 3, status: "active" },
  ],
  articles: [
    { id: "preview-article-1", slug: "preview-article-1", title: "第一次接觸泰國佛牌：先看懂年份、材質與來源", excerpt: "先從可以查證的資料開始。", tag: "新手指南", status: "published" },
    { id: "preview-article-2", slug: "preview-article-2", title: "佛牌外殼只是保護嗎？常見材質與收藏方式", excerpt: "從日常配戴到長期保存。", tag: "收藏保養", status: "published" },
    { id: "preview-article-3", slug: "preview-article-3", title: "佛牌來源紀錄應包含哪些資料？", excerpt: "整理取得、保存與轉手資訊，方便日後查詢。", tag: "來源紀錄", status: "published" },
  ],
};
