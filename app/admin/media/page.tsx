import type { Metadata } from "next";
import { publishedBrandName } from "../../../shared/published-site";
import MediaManager from "./media-manager";

export const metadata: Metadata = {
  title: { absolute: `媒體庫｜${publishedBrandName}` },
  description: `${publishedBrandName}商品、文章與網站圖片媒體管理。`,
  robots: { index: false, follow: false },
};

export default function AdminMediaPage() {
  return <MediaManager />;
}
