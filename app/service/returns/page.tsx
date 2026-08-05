import type { Metadata } from "next";
import InfoPage from "../../info-page";
import { infoPageMetadata } from "../../site-metadata";
import { publishedBrandName } from "../../../shared/published-site";

export const metadata: Metadata = infoPageMetadata(
  "退換貨說明",
  `${publishedBrandName}通訊交易解除、商品檢查與退換貨聯繫原則。`,
  "service/returns/",
);

export default function ReturnsPage() {
  return <InfoPage eyebrow="RETURNS & CARE" title="退換貨說明" intro="收到商品後請先核對藏品編號、外觀、附件與包裝，若有問題請保留完整資料並儘快聯繫。" path="service/returns/">
    <section><h2>通訊交易權益</h2><p>透過網路完成的交易，將依台灣消費者保護法及適用規定辦理。原則上，通訊交易消費者可在收受商品後依法定期間行使解除權；若商品依法屬合理例外情形，會在交易成立前另外清楚告知。</p></section>
    <section><h2>收到商品時</h2><ul><li>建議從未拆封的外箱開始錄影，留下物流與開箱狀態。</li><li>核對藏品編號、照片、附件與訂單確認內容。</li><li>若有運送損傷、品項錯誤或資料不符，請保留包裝與照片。</li></ul></section>
    <section><h2>聯繫資料</h2><p>提出需求時請提供訂單編號、姓名、聯絡方式、商品狀況及照片。店家確認後會說明取回、退款或其他處理方式；在確認前請勿自行寄回，以免資料無法核對。</p></section>
    <section><p>本頁為第一版交易說明，正式營業主體、聯絡資訊與個別商品例外條件確認後，仍需再完成法律與營運覆核。</p></section>
  </InfoPage>;
}
