import type { Metadata } from "next";
import Storefront from "./storefront";
import { products } from "./data";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";

export const metadata: Metadata = {
  title: "泰國佛牌與聖物收藏",
  description: `${publishedBrandName}以來源欄位與文化導讀為核心，整理泰國佛牌與聖物的展示版型。`,
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
        "@type": "OnlineStore",
        "@id": new URL("#store", siteUrl).toString(),
        name: publishedBrandName,
        description: "以來源紀錄與文化導讀為核心的泰國佛牌與聖物選物。",
        areaServed: "TW",
      },
      ...(structuredProducts.length > 0 ? [{
        "@type": "ItemList",
        name: "本週新藏",
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
