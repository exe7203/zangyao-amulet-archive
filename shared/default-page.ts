export const DEFAULT_BRAND_PAGE = {
  id: "page_taijuda_brand_story",
  slug: "brand-story",
  title: "泰聚達品牌故事",
  seoTitle: "泰聚達品牌故事｜泰國佛牌收藏履歷",
  seoDescription: "認識泰聚達如何以年份、材質、尺寸、來源與保存紀錄整理泰國佛牌和聖物，從可查證資料開始建立可閱讀的收藏履歷。",
  canonicalUrl: "",
  ogImageUrl: "",
  noindex: false,
  data: {
    root: {},
    content: [
      {
        type: "Hero",
        props: {
          id: "hero-brand-story",
          eyebrow: "TAIJUDA ARCHIVE",
          title: "把來源說清楚，才值得長久收藏。",
          description: "從文化、工藝與可查證資料開始，建立每件聖物可閱讀的收藏履歷。",
          primaryLabel: "閱讀收藏誌",
          primaryHref: "/articles/",
          secondaryLabel: "聯絡我們",
          secondaryHref: "/service/contact/",
          tone: "ink",
        },
      },
      {
        type: "Text",
        props: {
          id: "text-brand-story",
          eyebrow: "OUR APPROACH",
          title: "來源可讀，收藏可久",
          body: "我們記錄年份、材質、尺寸、來源與保存狀況，也會把尚待確認的資訊清楚標示。",
          alignment: "left",
          tone: "paper",
        },
      },
    ],
  },
} as const;
