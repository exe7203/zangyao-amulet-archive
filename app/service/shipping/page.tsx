import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import {
  publishedBrandName,
  publishedSiteAppearance,
} from "../../../shared/published-site";
import infoStyles from "../../info-page.module.css";

export const metadata: Metadata = infoPageMetadata(
  "配送與付款",
  `${publishedBrandName}訂單確認、付款與台灣配送流程說明。`,
  "service/shipping/",
);

export default function ShippingPage() {
  const { shippingPolicySummary, paymentPolicySummary } = publishedSiteAppearance.settings;

  return (
    <InfoPage
      eyebrow="購物服務"
      title="配送與付款"
      intro={`正式開放訂購後，${publishedBrandName}會先確認商品、庫存、配送與付款資訊，不會在網站直接收取信用卡資料。`}
      path="service/shipping/"
    >
      <section>
        <h2>預計下單流程</h2>
        <ol>
          <li>將商品加入購物車並送出訂單。</li>
          <li>客服確認商品資料、實際庫存、商品狀況及配送方式。</li>
          <li>確認訂單內容與最終金額後，再通知可使用的付款方式。</li>
          <li>完成付款並核對資料後安排出貨。</li>
        </ol>
      </section>
      <section>
        <h2>配送與運費</h2>
        <p>{shippingPolicySummary}</p>
      </section>
      <section>
        <h2>付款方式</h2>
        <p>{paymentPolicySummary}</p>
      </section>
      <section>
        <h2>單件商品</h2>
        <p>
          標示為單件販售的商品通常只有一件。訂單送出後仍須由客服確認，避免同時間多筆需求造成超賣；完成付款前，訂單仍屬待確認狀態。
        </p>
      </section>
      <section>
        <p className={infoStyles.note}>
          網站不會要求輸入信用卡號或網路銀行密碼。目前為半手工接單：小計不含運費，最終金額以客服確認為準。
        </p>
      </section>
    </InfoPage>
  );
}
