"use client";

import Link from "next/link";
import { useState } from "react";
import { CART_STORAGE_KEY, addCartItem, parseCartStorage, serializeCartItems } from "../../cart";
import { products, type Product } from "../../data";

export default function ProductActions({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const canOrder = product.status === "active" && product.stock > 0;

  const add = () => {
    try {
      const catalog = products.some((candidate) => candidate.id === product.id)
        ? products
        : [...products, product];
      const current = parseCartStorage(window.localStorage.getItem(CART_STORAGE_KEY), catalog);
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCartItems(addCartItem(current, product)));
      setAdded(true);
    } catch {
      setAdded(false);
    }
  };

  return <div>
    <button type="button" onClick={add} disabled={!canOrder}>{canOrder ? "加入收藏袋" : "目前不可訂購"}</button>
    {added && <p role="status">已加入收藏袋。<Link href="/#new">返回首頁查看收藏袋 →</Link></p>}
  </div>;
}
