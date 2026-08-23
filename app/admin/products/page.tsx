import type { Metadata } from "next";
import { publishedBrandName } from "../../../shared/published-site";
import StoreManager from "../store-manager";

export const metadata: Metadata = { title: { absolute: `商品與庫存管理｜${publishedBrandName}` }, robots: { index: false, follow: false } };
export default function ProductsAdminPage() { return <StoreManager mode="products" />; }
