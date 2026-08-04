import type { Metadata } from "next";
import { publishedBrandName } from "../../../shared/published-site";
import StoreManager from "../store-manager";

export const metadata: Metadata = { title: `訂單管理｜${publishedBrandName}`, robots: { index: false, follow: false } };
export default function OrdersAdminPage() { return <StoreManager mode="orders" />; }
