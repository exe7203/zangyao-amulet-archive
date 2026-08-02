import type { Metadata } from "next";
import AdminShell from "./admin-shell";

export const metadata: Metadata = {
  title: "內容管理後台｜泰聚達",
  description: "泰聚達文章、SEO 與多站內容管理後台。",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminShell />;
}
