export type Product = {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  category: "佛牌" | "神尊" | "符印";
  origin: string;
  temple: string;
  buddhistYear: string;
  westernYear: string;
  material: string;
  dimensions: string;
  price: number;
  badge: string;
  tone: string;
  shape: "arch" | "oval" | "round" | "statue";
  theme: string;
};

export const products: Product[] = [
  { id: 1, slug: "somdej-classic-powder-small", name: "崇迪佛牌・經典粉質小模", shortName: "崇迪佛牌", category: "佛牌", origin: "曼谷地區", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2566", westernYear: "西元 2023", material: "粉質", dimensions: "3.4 × 2.4 cm", price: 3680, badge: "本週新藏", tone: "sand", shape: "arch", theme: "守護與安心" },
  { id: 2, slug: "pidta-black-powder", name: "必打佛・黑色粉質版", shortName: "必打佛", category: "佛牌", origin: "北欖府", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2565", westernYear: "西元 2022", material: "混合聖粉", dimensions: "2.8 × 2.2 cm", price: 4280, badge: "一物一拍", tone: "charcoal", shape: "oval", theme: "守護與安心" },
  { id: 3, slug: "khun-phaen-double-stamp", name: "坤平將軍・雙印模版", shortName: "坤平將軍", category: "佛牌", origin: "素攀府", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2564", westernYear: "西元 2021", material: "經粉混合材質", dimensions: "4.1 × 2.8 cm", price: 5980, badge: "藏家選物", tone: "terracotta", shape: "arch", theme: "人緣與溝通" },
  { id: 4, slug: "luang-pu-thuat-bronze-oval", name: "龍婆托・橢圓銅質版", shortName: "龍婆托", category: "佛牌", origin: "洛坤府", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2567", westernYear: "西元 2024", material: "古銅色合金", dimensions: "3.2 × 2.5 cm", price: 2880, badge: "台灣現貨", tone: "bronze", shape: "oval", theme: "事業與行動" },
  { id: 5, slug: "brahma-enamel-miniature", name: "四面神・金屬彩釉小尊", shortName: "四面神", category: "神尊", origin: "曼谷地區", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2566", westernYear: "西元 2023", material: "黃銅彩釉", dimensions: "高 4.5 cm", price: 4680, badge: "少量到藏", tone: "gold", shape: "statue", theme: "事業與行動" },
  { id: 6, slug: "ganesha-seated-miniature", name: "象神・坐姿紀念小尊", shortName: "象神", category: "神尊", origin: "清邁地區", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2567", westernYear: "西元 2024", material: "黃銅", dimensions: "高 5.2 cm", price: 6800, badge: "收藏推薦", tone: "antique", shape: "statue", theme: "學業與專注" },
  { id: 7, slug: "nang-kwak-temple-edition", name: "招財女神・寺院紀念版", shortName: "招財女神", category: "佛牌", origin: "大城府", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2565", westernYear: "西元 2022", material: "粉質", dimensions: "3.7 × 2.3 cm", price: 3280, badge: "一物一拍", tone: "ivory", shape: "arch", theme: "財運與商務" },
  { id: 8, slug: "hanuman-silver-seal", name: "哈奴曼・銀色符印版", shortName: "哈奴曼", category: "符印", origin: "佛統府", temple: "寺院來源待逐件覆核", buddhistYear: "佛曆 2566", westernYear: "西元 2023", material: "白色合金", dimensions: "3.6 × 2.6 cm", price: 5280, badge: "新藏入庫", tone: "silver", shape: "round", theme: "事業與行動" },
];

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(price);
