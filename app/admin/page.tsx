import type { Metadata } from "next";
import { publishedBrandName } from "../../shared/published-site";
import AdminDashboard from "./admin-dashboard";

export const metadata: Metadata = {
  title: { absolute: `營運總覽｜${publishedBrandName}` },
  description: `${publishedBrandName}內容、商品、訂單、庫存與網站營運總覽。`,
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
