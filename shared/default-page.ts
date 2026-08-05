export const DEFAULT_BRAND_PAGE = {
  id: "page_taijuda_brand_story",
  slug: "brand-story",
  title: "泰聚達品牌介紹",
  seoTitle: "泰聚達品牌介紹｜泰國佛牌與收藏品",
  seoDescription: "認識泰聚達的商品整理與來源資料標示原則，以及我們對商品資訊、實物照片、宗教文化、保存說明與消費資訊的基本原則。",
  canonicalUrl: "",
  ogImageUrl: "",
  noindex: true,
  data: {
    root: {},
    content: [
      {
        type: "Hero",
        props: {
          id: "hero-brand-story",
          eyebrow: "品牌介紹",
          title: "認識泰聚達",
          description: "我們專注於泰國佛牌與相關收藏品；正式上架前會整理商品照片、規格與來源說明。",
          primaryLabel: "閱讀佛牌專欄",
          primaryHref: "/articles/",
          secondaryLabel: "查看最新商品",
          secondaryHref: "/#new",
          tone: "ink",
        },
      },
      {
        type: "Text",
        props: {
          id: "text-brand-story",
          eyebrow: "我們重視的事",
          title: "清楚的商品資訊",
          body: "商品上架前會核對名稱、年份、材質、尺寸與來源資料；無法確認的資訊會明確標示。",
          alignment: "left",
          tone: "paper",
        },
      },
    ],
  },
} as const;
