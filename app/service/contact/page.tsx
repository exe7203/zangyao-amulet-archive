import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";

export const metadata: Metadata = infoPageMetadata(
  "聯絡與訂單協助",
  "泰聚達商品問題、訂單編號與售後協助方式。",
  "service/contact/",
);

export default function ContactPage() {
  return <InfoPage eyebrow="CONTACT" title="聯絡與訂單協助" intro="先留下可以核對的商品或訂單資料，處理會更快。">
    <section><h2>商品購買前</h2><p>請從商品頁查看典藏編號、年份、材質、尺寸與來源說明；若仍有疑問，可在保留單備註欄填寫希望確認的項目。</p><p><Link href="/#new">前往本週新藏 →</Link></p></section>
    <section><h2>已建立保留單</h2><p>聯繫時請準備畫面顯示的訂單編號。店家會使用保留單中提供的電話、電子郵件或 LINE ID 聯繫，不會要求提供信用卡密碼或簡訊驗證碼。</p></section>
    <section><h2>公開聯絡管道</h2><p>LINE 官方帳號、客服信箱與營業資訊尚未由站主正式設定，因此網站暫不顯示未確認的帳號。完成設定後，本頁可直接更新，不需要重做訂單或文章系統。</p></section>
  </InfoPage>;
}
