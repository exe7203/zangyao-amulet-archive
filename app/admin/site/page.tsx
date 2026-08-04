import type { Metadata } from "next";
import "@puckeditor/core/puck.css";
import { publishedBrandName } from "../../../shared/published-site";
import SiteEditorLoader from "./site-editor-loader";

export const metadata: Metadata = {
  title: `網站編輯｜${publishedBrandName}內容中樞`,
  description: "編排網站頁面區塊、SEO 與發布狀態。",
  robots: { index: false, follow: false },
};

export default function SiteEditorPage() {
  return <SiteEditorLoader />;
}
