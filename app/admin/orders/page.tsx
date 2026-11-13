import type { Metadata } from "next";
import { Suspense } from "react";
import { publishedBrandName } from "../../../shared/published-site";
import OrderWorkspace from "./order-workspace";

export const metadata: Metadata = {
  title: { absolute: `訂單管理｜${publishedBrandName}` },
  robots: { index: false, follow: false },
};

export default function OrdersAdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>載入訂單管理…</div>}>
      <OrderWorkspace />
    </Suspense>
  );
}
