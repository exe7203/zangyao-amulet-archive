import type { Metadata } from "next";
import StoreManager from "../store-manager";

export const metadata: Metadata = { title: "訂單管理｜泰聚達", robots: { index: false, follow: false } };
export default function OrdersAdminPage() { return <StoreManager mode="orders" />; }
