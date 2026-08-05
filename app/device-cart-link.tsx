"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CART_CHANGE_EVENT, CART_STORAGE_KEY, parseCartStorage } from "./cart";
import { products } from "./data";

export default function DeviceCartLink({ className }: { className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => {
      try {
        const items = parseCartStorage(
          window.localStorage.getItem(CART_STORAGE_KEY),
          products,
          { preserveUnknown: true },
        );
        setCount(items.reduce((sum, item) => sum + item.quantity, 0));
      } catch {
        setCount(0);
      }
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) load();
    };
    const timer = window.setTimeout(load, 0);
    window.addEventListener("storage", syncStorage);
    window.addEventListener(CART_CHANGE_EVENT, load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", syncStorage);
      window.removeEventListener(CART_CHANGE_EVENT, load);
    };
  }, []);

  return <Link className={className} href="/?cart=open" aria-label={`購物車，共 ${count} 件商品`}>購物車{count > 0 ? `（${count}）` : ""}</Link>;
}
