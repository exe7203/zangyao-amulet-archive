import type { Metadata } from "next";
import AccountClient from "./account-client";
import { infoPageMetadata } from "../site-metadata";

const baseMetadata = infoPageMetadata(
  "會員中心（此裝置預備版）",
  "管理這台裝置保存的結帳資料、收藏袋與送單紀錄；正式 LINE 與 Email 登入尚未啟用。",
  "account/",
);

export const metadata: Metadata = {
  ...baseMetadata,
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return <AccountClient />;
}
