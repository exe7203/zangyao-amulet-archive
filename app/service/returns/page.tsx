import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import {
  publishedBrandName,
  publishedSiteAppearance,
} from "../../../shared/published-site";
import { siteHasPublicContact } from "../../../shared/site-settings";
import infoStyles from "../../info-page.module.css";

export const metadata: Metadata = infoPageMetadata(
  "退換貨說明",
  `${publishedBrandName}通訊交易解除、商品檢查與退換貨聯繫原則。`,
  "service/returns/",
);

export default function ReturnsPage() {
  const settings = publishedSiteAppearance.settings;
  const hasContact = siteHasPublicContact(settings);

  return (
    <InfoPage
      eyebrow="購物服務"
      title="退換貨說明"
      intro="收到商品後請先核對商品編號、外觀、附件與包裝，若有問題請保留完整資料並儘快聯繫。"
      path="service/returns/"
    >
      <section>
        <h2>通訊交易權益</h2>
        <p>
          透過網路完成的交易，將依台灣消費者保護法及適用規定辦理。原則上，通訊交易消費者可在收受商品後依法定期間行使解除權；若商品依法屬合理例外情形，會在交易成立前另外清楚告知。
        </p>
      </section>
      <section>
        <h2>收到商品時</h2>
        <ul>
          <li>建議從未拆封的外箱開始錄影，留下物流與開箱狀態。</li>
          <li>核對商品編號、照片、附件與訂單確認內容。</li>
          <li>若有運送損傷、品項錯誤或資料不符，請保留包裝與照片。</li>
        </ul>
      </section>
      <section>
        <h2>退換貨原則</h2>
        <p>{settings.returnsPolicySummary}</p>
      </section>
      <section>
        <h2>聯繫方式</h2>
        {hasContact ? (
          <ul>
            {settings.contactPhone ? <li>電話：{settings.contactPhone}</li> : null}
            {settings.contactEmail ? (
              <li>
                Email：
                <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
              </li>
            ) : null}
            <li>
              亦可至 <a href="/service/contact/">客服資訊</a> 查看完整窗口。
            </li>
          </ul>
        ) : (
          <p>
            正式客服管道尚未公布。提出需求時請保留訂單編號、姓名、聯絡方式、商品狀況及照片；客服啟用後會說明取回、退款或其他處理方式。確認前請勿自行寄回。
          </p>
        )}
      </section>
      <section>
        <p className={infoStyles.note}>
          在客服確認前請勿自行寄回商品，以免資料無法核對。正式開放訂購後，本頁摘要會同步更新退貨地址與處理時程。
        </p>
      </section>
    </InfoPage>
  );
}
