import type { Metadata } from "next";
import { Suspense } from "react";
import { publishedBrandName } from "../../../shared/published-site";
import ProductWorkspace from "../catalog/product-workspace";

export const metadata: Metadata = {
  title: { absolute: `商品與庫存管理｜${publishedBrandName}` },
  robots: { index: false, follow: false },
};

export default function ProductsAdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>載入商品管理…</div>}>
      <ProductWorkspace />
    </Suspense>
  );
}
