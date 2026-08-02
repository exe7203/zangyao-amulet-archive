import type { Metadata } from "next";
import StoreManager from "../store-manager";

export const metadata: Metadata = { title: "商品與庫存管理｜泰聚達", robots: { index: false, follow: false } };
export default function ProductsAdminPage() { return <StoreManager mode="products" />; }
