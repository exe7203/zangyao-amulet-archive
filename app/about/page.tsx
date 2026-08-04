import type { Metadata } from "next";
import InfoPage from "../info-page";
import { infoPageMetadata } from "../site-metadata";
import { publishedBrandName } from "../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  `關於${publishedBrandName}`,
  `認識${publishedBrandName}如何記錄泰國佛牌與聖物的來源、年代、材質與保存資訊。`,
  "about/",
);

export default function AboutPage() {
  return <InfoPage eyebrow="ABOUT" title={`關於${publishedBrandName}`} intro="我們希望收藏的理由能被說清楚：已知的留下證據，未知的誠實標示。">
    <section><h2>來源可讀，收藏可久</h2><p>{publishedBrandName}以藏品履歷為核心，逐件整理名稱、取得地區、寺院或法會說法、佛曆與西元年份、材質、尺寸、保存狀態及實拍日期。履歷是現有資訊的紀錄，不等同真偽保證；仍待確認的內容會明確標示。</p></section>
    <section><h2>尊重信仰，也尊重判斷</h2><p>佛牌與聖物承載宗教、民俗與個人信仰。我們提供文化脈絡與收藏資訊，不以保證財運、感情、健康或其他結果作為銷售承諾。</p></section>
    <section><h2>一物一拍</h2><p>單件藏品會保留專屬編號、正反面及細節影像。相同名稱不代表狀況完全一致，訂單確認時應以該件商品頁與店家覆核結果為準。</p></section>
  </InfoPage>;
}
