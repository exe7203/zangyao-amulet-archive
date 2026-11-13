import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";
import ReturnsLive from "./returns-live";

export const metadata: Metadata = infoPageMetadata(
  "退換貨說明",
  `${publishedBrandName}通訊交易解除、商品檢查與退換貨聯繫原則。`,
  "service/returns/",
);

export default function ReturnsPage() {
  return (
    <InfoPage
      eyebrow="購物服務"
      title="退換貨說明"
      intro="收到商品後請先核對商品編號、外觀、附件與包裝，若有問題請保留完整資料並儘快聯繫。"
      path="service/returns/"
    >
      <ReturnsLive />
    </InfoPage>
  );
}
