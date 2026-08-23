import type { Metadata } from "next";
import Storefront from "./storefront";
import { products } from "./data";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";
import { resolveSiteUrl } from "../shared/site-url";

const resolvedSite = resolveSiteUrl();

export const metadata: Metadata = {
  title: "泰國佛牌與收藏品",
  description: `${publishedBrandName}提供泰國佛牌與相關收藏品資訊，整理年份、材質、尺寸、來源與保存狀況，方便查閱與比較。`,
  robots: {
    index: resolvedSite.indexable,
    follow: resolvedSite.indexable,
  },
};

export default function Home() {
  const publicSiteUrl = resolvedSite.publicUrl;
  const catalogVerified = process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1";
  const organizationId = publicSiteUrl
    ? new URL(catalogVerified ? "#store" : "#organization", publicSiteUrl).toString()
    : null;
  const structuredProducts = catalogVerified
    ? products.filter((product) =>
      (product.status === "active" || product.status === "sold_out") &&
      product.seoReady === true &&
      Boolean(product.imageUrl?.trim()) &&
      Boolean(product.imageAlt?.trim()))
    : [];
  const structuredData = organizationId && publicSiteUrl ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": new URL("#website", publicSiteUrl).toString(),
        url: publicSiteUrl.toString(),
        name: publishedBrandName,
        description: "泰國佛牌與相關收藏品的商品資訊、文化文章與選購服務。",
        inLanguage: "zh-Hant-TW",
        publisher: { "@id": organizationId },
      },
      {
        "@type": catalogVerified ? "OnlineStore" : "Organization",
        "@id": organizationId,
        url: publicSiteUrl.toString(),
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
            url: new URL(`products/${product.slug}/`, publicSiteUrl).toString(),
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
  } : null;

  return (
    <>
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />}
      <Storefront />
    </>
  );
}
