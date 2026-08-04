"use client";

import dynamic from "next/dynamic";
import { publishedBrandName } from "../../../shared/published-site";

const SiteEditor = dynamic(() => import("./site-editor"), {
  ssr: false,
  loading: () => <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f0e8", color: "#24312b" }}>
    正在載入{publishedBrandName}網站編輯器…
  </main>,
});

export default function SiteEditorLoader() {
  return <SiteEditor />;
}
