import type { Metadata } from "next";
import InfoPage from "../info-page";
import { infoPageMetadata } from "../site-metadata";
import { publishedBrandName } from "../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  `關於${publishedBrandName}`,
  `認識${publishedBrandName}的商品整理方式、實物拍攝原則與來源資料標示方式。`,
  "about/",
);

export default function AboutPage() {
  return <InfoPage eyebrow="品牌介紹" title={`關於${publishedBrandName}`} intro="我們整理可確認的商品資料，也清楚標示仍待查證的項目。" path="about/">
    <section><h2>商品資料清楚透明</h2><p>{publishedBrandName}會在商品上架前核對名稱、來源說明、年份、材質、尺寸與保存狀況。商品照片、價格與來源資料確認前不會開放訂購；來源紀錄用於整理現有資訊，不取代專業鑑定。</p></section>
    <section><h2>尊重信仰，資訊不誇大</h2><p>佛牌與相關收藏品具有宗教、民俗與個人信仰背景。我們提供文化與商品資訊，不以財運、感情、健康或其他特定結果作為銷售保證。</p></section>
    <section><h2>實物拍攝與單件編號</h2><p>正式上架的單件商品會提供商品編號、正反面與細節照片。相同名稱的商品仍可能有不同保存狀況，下單前請以商品頁標示及客服確認內容為準。</p></section>
  </InfoPage>;
}
