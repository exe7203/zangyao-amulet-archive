import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  "客服資訊",
  `${publishedBrandName}客服聯絡方式與服務時間公告。`,
  "service/contact/",
);

export default function ContactPage() {
  return <InfoPage eyebrow="客服服務" title="客服資訊" intro="客服聯絡方式與服務時間會在正式開放訂購前公布。" path="service/contact/">
    <section><h2>目前狀態</h2><p>{publishedBrandName}尚未公布正式客服管道，因此本頁目前不提供 LINE 帳號、電子郵件或電話，避免使用未確認的聯絡資料。</p></section>
    <section><h2>商品諮詢</h2><p>客服服務啟用後，諮詢商品時請提供商品編號及希望確認的項目；訂單查詢則請準備訂單編號。</p></section>
    <section><h2>安全提醒</h2><p>正式客服不會要求提供信用卡密碼、網路銀行密碼或簡訊驗證碼。客服管道公布後，請以本網站列出的資訊為準。</p></section>
  </InfoPage>;
}
