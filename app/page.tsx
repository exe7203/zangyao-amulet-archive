import type { Metadata } from "next";
import Storefront from "./storefront";
import { products } from "./data";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";

export const metadata: Metadata = {
  title: "泰國佛牌與收藏品",
  description: `${publishedBrandName}提供泰國佛牌與相關收藏品資訊，整理年份、材質、尺寸、來源與保存狀況，方便查閱與比較。`,
  robots: {
    index: true,
    follow: true,
  },
};

export default function Home() {
  const siteUrl = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/",
  );
  const catalogVerified = process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1";
  const organizationId = new URL(catalogVerified ? "#store" : "#organization", siteUrl).toString();
  const structuredProducts = catalogVerified
    ? products.filter((product) =>
      (product.status === "active" || product.status === "sold_out") &&
      product.seoReady === true &&
      Boolean(product.imageUrl?.trim()) &&
      Boolean(product.imageAlt?.trim()))
    : [];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": new URL("#website", siteUrl).toString(),
        url: siteUrl.toString(),
        name: publishedBrandName,
        description: "泰國佛牌與相關收藏品的商品資訊、文化文章與選購服務。",
        inLanguage: "zh-Hant-TW",
        publisher: { "@id": organizationId },
      },
      {
        "@type": catalogVerified ? "OnlineStore" : "Organization",
        "@id": organizationId,
        url: siteUrl.toString(),
        name: publishedBrandName,
        description: catalogVerified
          ? "提供泰國佛牌與相關收藏品資訊及線上選購服務。"
          : "提供泰國佛牌與相關收藏品資訊。",
        areaServed: "TW",
      },
      ...(structuredProducts.length > 0 ? [{
        "@type": "ItemList",
        name: "最新商品",
        itemListElement: structuredProducts.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.name,
            category: product.category,
            material: product.material,
            image: product.imageUrl,
            url: new URL(`products/${product.slug}/`, siteUrl).toString(),
            offers: {
              "@type": "Offer",
              priceCurrency: "TWD",
              price: product.price,
              availability: product.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          },
        })),
      }] : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <Storefront />
    </>
  );
}
