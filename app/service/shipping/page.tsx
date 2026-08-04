import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  "配送與付款",
  `${publishedBrandName}商品保留、付款確認與台灣配送流程說明。`,
  "service/shipping/",
);

export default function ShippingPage() {
  return <InfoPage eyebrow="DELIVERY & PAYMENT" title="配送與付款" intro="目前採先建立保留單、再由店家確認的方式，不會在網站直接收取款項。">
    <section><h2>下單流程</h2><ol><li>將商品加入收藏袋並送出保留單。</li><li>店家逐件確認來源資料、實際庫存、商品狀態及配送方式。</li><li>確認內容與最終金額後，再通知可使用的付款方式。</li><li>完成付款並核對資料後安排出貨。</li></ol></section>
    <section><h2>配送方式</h2><p>第一階段提供台灣本島宅配、超商取貨需求登記與預約面交。超商門市、可配送區域、運費及預計時間會在付款前再次確認；未完成確認前，網站顯示的小計不包含運費。</p></section>
    <section><h2>單件商品</h2><p>標示「一物一拍」的藏品通常只有一件。保留單送出後仍須由店家確認，避免同時間多筆需求造成超賣；付款完成前不應視為交易已完成。</p></section>
    <section><p className="info-note">網站不會要求輸入信用卡號或網路銀行密碼。正式金流尚未串接前，付款資訊僅應透過店家確認的管道取得。</p></section>
  </InfoPage>;
}
