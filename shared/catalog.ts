export type ProductCategory = "佛牌" | "神尊" | "符印";
export type ProductShape = "arch" | "oval" | "round" | "statue";
export type ProductStatus = "draft" | "active" | "sold_out" | "archived";

export type CatalogCategory = {
  id: string;
  slug: string;
  name: ProductCategory;
  description: string;
  sortOrder: number;
  status: "active" | "archived";
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  category: ProductCategory;
  origin: string;
  temple: string;
  buddhistYear: string;
  westernYear: string;
  material: string;
  dimensions: string;
  price: number;
  badge: string;
  tone: string;
  shape: ProductShape;
  theme: string;
  purchaseLimit: number;
  stock: number;
  status: ProductStatus;
  seoTitle: string;
  seoDescription: string;
  imageUrl?: string;
  imageAlt?: string;
  seoReady?: boolean;
  version?: number;
  updatedAt?: string;
};

export const catalogCategories: CatalogCategory[] = [
  { id: "category_taijuda_amulet", slug: "amulet", name: "佛牌", description: "泰國佛牌與寺院紀念聖物", sortOrder: 10, status: "active" },
  { id: "category_taijuda_deity", slug: "deity", name: "神尊", description: "神尊與紀念小尊", sortOrder: 20, status: "active" },
  { id: "category_taijuda_talisman", slug: "talisman", name: "符印", description: "符印、紀念章與相關聖物", sortOrder: 30, status: "active" },
];

export const products: Product[] = [
  {
    id: "product_taijuda_001", sku: "TJD-AMU-001", slug: "somdej-classic-powder-small",
    name: "崇迪佛牌・粉質小模", shortName: "崇迪佛牌", description: "粉質小模，商品年份、來源與保存狀況確認後更新。",
    category: "佛牌", origin: "曼谷地區", temple: "來源資料確認中", buddhistYear: "佛曆 2566", westernYear: "西元 2023",
    material: "粉質", dimensions: "3.4 × 2.4 cm", price: 3680, badge: "新品", tone: "sand", shape: "arch", theme: "守護與安心",
    purchaseLimit: 3, stock: 3, status: "active", seoTitle: "崇迪佛牌粉質小模｜泰聚達", seoDescription: "崇迪佛牌粉質小模商品資料整理中，完成確認後將補充照片、年份、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_002", sku: "TJD-AMU-002", slug: "pidta-black-powder",
    name: "必打佛・黑色粉質橢圓模", shortName: "必打佛", description: "黑色粉質橢圓模，商品材質、年份、來源與保存狀況確認後更新。",
    category: "佛牌", origin: "北欖府", temple: "來源資料確認中", buddhistYear: "佛曆 2565", westernYear: "西元 2022",
    material: "粉質混合材質", dimensions: "2.8 × 2.2 cm", price: 4280, badge: "單件商品", tone: "charcoal", shape: "oval", theme: "守護與安心",
    purchaseLimit: 1, stock: 1, status: "active", seoTitle: "必打佛黑色粉質橢圓模｜泰聚達", seoDescription: "必打佛黑色粉質橢圓模商品資料整理中，完成確認後將補充照片、材質、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_003", sku: "TJD-AMU-003", slug: "khun-phaen-double-stamp",
    name: "坤平佛牌・雙印模", shortName: "坤平佛牌", description: "雙印模粉質佛牌，商品材質、年份、來源與保存狀況確認後更新。",
    category: "佛牌", origin: "素攀府", temple: "來源資料確認中", buddhistYear: "佛曆 2564", westernYear: "西元 2021",
    material: "粉質混合材質", dimensions: "4.1 × 2.8 cm", price: 5980, badge: "推薦商品", tone: "terracotta", shape: "arch", theme: "人緣與溝通",
    purchaseLimit: 2, stock: 2, status: "active", seoTitle: "坤平佛牌雙印模｜泰聚達", seoDescription: "坤平佛牌雙印模商品資料整理中，完成確認後將補充照片、年份、材質、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_004", sku: "TJD-AMU-004", slug: "luang-pu-thuat-bronze-oval",
    name: "龍婆托・橢圓合金版", shortName: "龍婆托", description: "古銅色合金橢圓版本，商品年份、來源與保存狀況確認後更新。",
    category: "佛牌", origin: "洛坤府", temple: "來源資料確認中", buddhistYear: "佛曆 2567", westernYear: "西元 2024",
    material: "古銅色合金", dimensions: "3.2 × 2.5 cm", price: 2880, badge: "新品", tone: "bronze", shape: "oval", theme: "事業與行動",
    purchaseLimit: 4, stock: 4, status: "active", seoTitle: "龍婆托橢圓合金版｜泰聚達", seoDescription: "龍婆托橢圓合金版商品資料整理中，完成確認後將補充照片、年份、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_005", sku: "TJD-DEI-001", slug: "brahma-enamel-miniature",
    name: "四面神・金屬彩釉小尊", shortName: "四面神", description: "黃銅彩釉紀念小尊，適合桌面陳列與收藏。",
    category: "神尊", origin: "曼谷地區", temple: "來源資料確認中", buddhistYear: "佛曆 2566", westernYear: "西元 2023",
    material: "黃銅彩釉", dimensions: "高 4.5 cm", price: 4680, badge: "少量現貨", tone: "gold", shape: "statue", theme: "事業與行動",
    purchaseLimit: 2, stock: 2, status: "active", seoTitle: "四面神金屬彩釉小尊｜泰聚達", seoDescription: "四面神黃銅彩釉小尊的尺寸、材質與來源紀錄。",
  },
  {
    id: "product_taijuda_006", sku: "TJD-DEI-002", slug: "ganesha-seated-miniature",
    name: "象神・坐姿紀念小尊", shortName: "象神", description: "黃銅坐姿紀念小尊，商品年份、尺寸、來源與保存狀況確認後更新。",
    category: "神尊", origin: "清邁地區", temple: "來源資料確認中", buddhistYear: "佛曆 2567", westernYear: "西元 2024",
    material: "黃銅", dimensions: "高 5.2 cm", price: 6800, badge: "推薦商品", tone: "antique", shape: "statue", theme: "學業與專注",
    purchaseLimit: 2, stock: 2, status: "active", seoTitle: "象神坐姿紀念小尊｜泰聚達", seoDescription: "象神坐姿紀念小尊商品資料整理中，完成確認後將補充照片、年份、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_007", sku: "TJD-AMU-005", slug: "nang-kwak-temple-edition",
    name: "招財女神・粉質紀念版", shortName: "招財女神", description: "粉質紀念版本，商品年份、來源與保存狀況確認後更新。",
    category: "佛牌", origin: "大城府", temple: "來源資料確認中", buddhistYear: "佛曆 2565", westernYear: "西元 2022",
    material: "粉質", dimensions: "3.7 × 2.3 cm", price: 3280, badge: "單件商品", tone: "ivory", shape: "arch", theme: "財運與商務",
    purchaseLimit: 1, stock: 1, status: "active", seoTitle: "招財女神粉質紀念版｜泰聚達", seoDescription: "招財女神粉質紀念版商品資料整理中，完成確認後將補充照片、年份、尺寸、來源與保存狀況。",
  },
  {
    id: "product_taijuda_008", sku: "TJD-TAL-001", slug: "hanuman-silver-seal",
    name: "哈奴曼・銀色符印版", shortName: "哈奴曼", description: "白色合金符印版本，商品年份、尺寸、來源與保存狀況確認後更新。",
    category: "符印", origin: "佛統府", temple: "來源資料確認中", buddhistYear: "佛曆 2566", westernYear: "西元 2023",
    material: "白色合金", dimensions: "3.6 × 2.6 cm", price: 5280, badge: "新品", tone: "silver", shape: "round", theme: "事業與行動",
    purchaseLimit: 3, stock: 3, status: "active", seoTitle: "哈奴曼銀色符印版｜泰聚達", seoDescription: "哈奴曼銀色符印版商品資料整理中，完成確認後將補充照片、年份、材質、尺寸、來源與保存狀況。",
  },
];

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(price);
