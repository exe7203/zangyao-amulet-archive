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
  "客服資訊",
  `${publishedBrandName}客服聯絡方式與服務時間。`,
  "service/contact/",
);

export default function ContactPage() {
  const settings = publishedSiteAppearance.settings;
  const hasContact = siteHasPublicContact(settings);

  return (
    <InfoPage
      eyebrow="客服服務"
      title="客服資訊"
      intro={hasContact
        ? `${publishedBrandName}客服管道如下。商品與訂單問題請優先使用本頁列出的官方聯絡方式。`
        : `客服聯絡方式與服務時間會在正式開放訂購前公布。目前尚未對外開放正式客服管道。`}
      path="service/contact/"
    >
      <section>
        <h2>聯絡方式</h2>
        {hasContact ? (
          <ul>
            {settings.contactPhone ? <li>電話：{settings.contactPhone}</li> : null}
            {settings.contactEmail ? (
              <li>
                Email：
                <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
              </li>
            ) : null}
            {settings.lineOfficialUrl ? (
              <li>
                LINE 官方：
                <a href={settings.lineOfficialUrl} rel="noopener noreferrer" target="_blank">
                  開啟官方帳號
                </a>
              </li>
            ) : null}
            {settings.contactHours ? <li>服務時間：{settings.contactHours}</li> : null}
            {settings.businessLegalName ? <li>商號：{settings.businessLegalName}</li> : null}
            {settings.businessAddress ? <li>地址：{settings.businessAddress}</li> : null}
          </ul>
        ) : (
          <p>
            {publishedBrandName}尚未公布正式客服管道，因此本頁目前不提供 LINE 帳號、電子郵件或電話，
            避免使用未確認的聯絡資料。站主可於後台「全站設定 → 企業與客服資訊」填寫後同步上線。
          </p>
        )}
      </section>
      <section>
        <h2>商品諮詢</h2>
        <p>諮詢商品時請提供商品編號及希望確認的項目；訂單查詢則請準備訂單編號。</p>
      </section>
      <section>
        <h2>安全提醒</h2>
        <p className={infoStyles.note}>
          正式客服不會要求提供信用卡密碼、網路銀行密碼或簡訊驗證碼。請以本網站列出的資訊為準，勿輕信非官方管道。
        </p>
      </section>
    </InfoPage>
  );
}
