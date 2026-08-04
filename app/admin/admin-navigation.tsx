"use client";

import Link from "next/link";

export type AdminArea = "dashboard" | "articles" | "site" | "products" | "orders";

const adminAreas: ReadonlyArray<{ key: AdminArea; href: string; label: string }> = [
  { key: "dashboard", href: "/admin/", label: "總覽" },
  { key: "articles", href: "/admin/articles/", label: "文章" },
  { key: "site", href: "/admin/site/", label: "網站" },
  { key: "products", href: "/admin/products/", label: "商品與庫存" },
  { key: "orders", href: "/admin/orders/", label: "訂單" },
];

export default function AdminNavigation({
  active,
  className,
  activeClassName,
}: {
  active: AdminArea;
  className?: string;
  activeClassName?: string;
}) {
  return (
    <nav className={className} aria-label="後台功能">
      {adminAreas.map((area) => (
        <Link
          key={area.key}
          className={area.key === active ? activeClassName : undefined}
          href={area.href}
          aria-current={area.key === active ? "page" : undefined}
        >
          {area.label}
        </Link>
      ))}
    </nav>
  );
}
