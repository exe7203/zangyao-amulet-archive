import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "後台登入｜泰聚達" },
  description: "泰聚達後台登入。",
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
