import type { Metadata } from "next";
import { publishedBrandName } from "../../../shared/published-site";
import AdminShell from "../admin-shell";

export const metadata: Metadata = {
  title: `文章管理｜${publishedBrandName}`,
  description: `${publishedBrandName}文章、SEO 與版本管理後台。`,
  robots: { index: false, follow: false },
};

export default function ArticlesAdminPage() {
  return <AdminShell />;
}
