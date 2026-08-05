import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  "隱私與保留單資料說明",
  `${publishedBrandName}保留單會收集哪些聯絡與配送資料、用途、保存原則及查詢刪除方式。`,
  "service/privacy/",
);

export default function PrivacyPage() {
  return <InfoPage eyebrow="PRIVACY" title="隱私與保留單資料說明" intro="保留單不是線上付款；只在確認藏品、庫存、聯絡與配送所需範圍內使用資料。" path="service/privacy/">
    <section><h2>會收集的資料</h2><p>建立保留單時會記錄姓名、電話，以及你自願填寫的電子郵件、LINE ID、配送地址、取貨方式與備註。系統同時保存訂單商品、金額、狀態與庫存紀錄。</p></section>
    <section><h2>使用目的</h2><p>資料只用於核對商品與庫存、聯繫付款及配送安排、處理取消或售後問題，以及保留必要的訂單與庫存稽核紀錄。網站不會因建立保留單而自動向第三方投放廣告。</p></section>
    <section><h2>保留期限</h2><p>未付款且未確認的保留單預設保留 72 小時，逾期會自動取消並釋放庫存。個人資料的正式保存與刪除期限仍需由站主依實際營運、稅務與消費爭議需求設定；公開接單前必須完成這項政策。</p></section>
    <section><h2>查詢、更正與刪除</h2><p>請使用聯絡頁提供訂單編號並提出查詢、更正或刪除需求。依法令或交易稽核必須保存的部分，會先告知保存依據與可刪除範圍。</p></section>
    <section><h2>此裝置保存資料</h2><p>本機版可由你主動選擇，把常用聯絡與配送資料保存在目前瀏覽器，最長 180 天，供下次結帳預填；送單索引只保留訂單編號、商品摘要、金額與送出時狀態，不保存地址或備註。這些資料不是正式會員帳號，不會跨裝置同步，可隨時在會員中心清除。共用電腦請勿啟用保存。</p></section>
    <section><h2>目前運行範圍</h2><p>本機版資料保存在站主電腦的專案資料夾；GitHub Pages 公開展示版不提供保留單表單，也不儲存訂單個資。若日後部署公開後台，必須先設定管理員允許名單、濫用防護、備份與資料保留流程。</p></section>
  </InfoPage>;
}
