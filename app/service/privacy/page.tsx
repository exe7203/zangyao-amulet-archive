import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  "隱私權政策",
  `${publishedBrandName}說明訂購時可能收集的聯絡與配送資料、使用目的、保存原則及查詢刪除方式。`,
  "service/privacy/",
);

export default function PrivacyPage() {
  return <InfoPage eyebrow="隱私權" title="隱私權政策" intro="說明訂購與客服聯繫時可能使用的資料，以及查詢、更正與刪除方式。" path="service/privacy/">
    <section><h2>會收集的資料</h2><p>建立訂單時會記錄姓名、電話，以及你自願填寫的電子郵件、LINE ID、配送地址、取貨方式與備註。系統同時保存訂單商品、金額、狀態與庫存紀錄。</p></section>
    <section><h2>使用目的</h2><p>資料只用於核對商品與庫存、聯繫付款及配送安排、處理取消或售後問題，以及保留必要的訂單與庫存稽核紀錄。網站不會因建立訂單而自動向第三方投放廣告。</p></section>
    <section><h2>訂單保留期限</h2><p>未付款且未確認的訂單預設保留 72 小時，逾期會自動取消並釋放庫存。個人資料的正式保存與刪除期限，將依實際營運、稅務與消費爭議處理需求設定並公布。</p></section>
    <section><h2>查詢、更正與刪除</h2><p>請使用聯絡頁提供訂單編號並提出查詢、更正或刪除需求。依法令或交易稽核必須保存的部分，會先告知保存依據與可刪除範圍。</p></section>
    <section><h2>瀏覽器中的收件資料</h2><p>你可以主動選擇將常用聯絡與配送資料保存在目前瀏覽器，供下次結帳預填，並可隨時在會員中心清除。不建議在公用裝置使用這項功能。</p></section>
    <section><h2>目前服務範圍</h2><p>目前公開網站僅供瀏覽，不提供線上送出訂單，因此不會收集訂單個資。正式開放訂購前，將完成管理權限、資料備份與保存流程。</p></section>
  </InfoPage>;
}
