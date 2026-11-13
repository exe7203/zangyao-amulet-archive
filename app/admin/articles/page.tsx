import type { Metadata } from "next";
import { Suspense } from "react";
import { publishedBrandName } from "../../../shared/published-site";
import ArticleEditor from "./article-editor";

export const metadata: Metadata = {
  title: { absolute: `文章管理｜${publishedBrandName}` },
  description: `${publishedBrandName}文章、SEO 與版本管理後台。`,
  robots: { index: false, follow: false },
};

export default function ArticlesAdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>載入文章管理…</div>}>
      <ArticleEditor />
    </Suspense>
  );
}
