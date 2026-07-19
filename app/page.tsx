import type { Metadata } from "next";
import Storefront from "./storefront";
import { products } from "./data";

export const metadata: Metadata = {
  title: "泰國佛牌與聖物收藏原型",
  description: "以來源紀錄、實物影像與文化導讀為核心的泰國佛牌與聖物選物前台概念。",
};

export default function Home() {
  const siteUrl = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/",
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": new URL("#store", siteUrl).toString(),
        name: "藏曜選物",
        alternateName: "ZANGYAO AMULET ARCHIVE",
        description: "以來源紀錄與文化導讀為核心的泰國佛牌收藏選物原型。",
        areaServed: "TW",
      },
      {
        "@type": "ItemList",
        name: "本週新藏",
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.name,
            category: product.category,
            material: product.material,
            offers: {
              "@type": "Offer",
              priceCurrency: "TWD",
              price: product.price,
              availability: "https://schema.org/InStock",
            },
          },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <Storefront />
    </>
  );
}
