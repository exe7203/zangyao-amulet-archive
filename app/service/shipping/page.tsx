import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";
import ShippingLive from "./shipping-live";

export const metadata: Metadata = infoPageMetadata(
  "配送與付款",
  `${publishedBrandName}訂單確認、付款與台灣配送流程說明。`,
  "service/shipping/",
);

export default function ShippingPage() {
  return (
    <InfoPage
      eyebrow="購物服務"
      title="配送與付款"
      intro={`正式開放訂購後，${publishedBrandName}會先確認商品、庫存、配送與付款資訊，不會在網站直接收取信用卡資料。`}
      path="service/shipping/"
    >
      <ShippingLive />
    </InfoPage>
  );
}
