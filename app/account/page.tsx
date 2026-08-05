import type { Metadata } from "next";
import AccountClient from "./account-client";
import { infoPageMetadata } from "../site-metadata";
import PublicFooter from "../public-footer";
import PublicHeader from "../public-header";

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
  return <>
    <PublicHeader section="account" contextLinks={[{ href: "/#new", label: "繼續選藏" }, { href: "/service/privacy/", label: "資料說明" }]} />
    <AccountClient />
    <PublicFooter note="正式會員功能待驗證服務與資料庫啟用後接上；目前資料均由你在此裝置管理。" />
  </>;
}
