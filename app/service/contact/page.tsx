import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import {
  publishedBrandName,
  publishedSiteAppearance,
} from "../../../shared/published-site";
import { siteHasPublicContact } from "../../../shared/site-settings";
import ContactLive from "./contact-live";

export const metadata: Metadata = infoPageMetadata(
  "客服資訊",
  `${publishedBrandName}客服聯絡方式與服務時間。`,
  "service/contact/",
);

export default function ContactPage() {
  const hasContact = siteHasPublicContact(publishedSiteAppearance.settings);

  return (
    <InfoPage
      eyebrow="客服服務"
      title="客服資訊"
      intro={hasContact
        ? `${publishedBrandName}客服管道如下。商品與訂單問題請優先使用本頁列出的官方聯絡方式。`
        : `客服聯絡方式與服務時間會在正式開放訂購前公布。目前尚未對外開放正式客服管道。`}
      path="service/contact/"
    >
      <ContactLive />
    </InfoPage>
  );
}
