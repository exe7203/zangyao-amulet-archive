import type { Metadata } from "next";
import AccountClient from "./account-client";
import { infoPageMetadata } from "../site-metadata";
import PublicFooter from "../public-footer";
import PublicHeader from "../public-header";

const baseMetadata = infoPageMetadata(
  "會員中心",
  "登入泰聚達會員中心，查看訂單進度並管理個人資料與常用收件資訊。",
  "account/",
);

export const metadata: Metadata = {
  ...baseMetadata,
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return <>
    <PublicHeader section="account" contextLinks={[{ href: "/#new", label: "繼續購物" }, { href: "/service/privacy/", label: "隱私說明" }]} />
    <AccountClient />
    <PublicFooter note="會員資料與訂單內容只用於提供購物、配送與售後服務。" />
  </>;
}
