"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CART_STORAGE_KEY,
  CART_CHANGE_EVENT,
  MAX_CART_DISTINCT_ITEMS,
  addCartItem,
  parseCartStorage,
  serializeCartItems,
} from "../../cart";
import { products, type Product } from "../../data";

export default function ProductActions({
  product,
  availabilityConfirmed = false,
  orderReady = false,
}: {
  product: Product;
  availabilityConfirmed?: boolean;
  orderReady?: boolean;
}) {
  const [message, setMessage] = useState("");
  const canOrder = availabilityConfirmed && orderReady && product.status === "active" && product.stock > 0;

  const add = () => {
    if (!canOrder) {
      setMessage("這項商品目前暫不開放訂購。");
      return;
    }
    try {
      const catalog = products.some((candidate) => candidate.id === product.id)
        ? products
        : [...products, product];
      const current = parseCartStorage(
        window.localStorage.getItem(CART_STORAGE_KEY),
        catalog,
        { preserveUnknown: true },
      );
      const alreadyInCart = current.some((item) => item.productId === product.id);
      if (!alreadyInCart && current.length >= MAX_CART_DISTINCT_ITEMS) {
        setMessage(`購物車最多可放 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先回首頁移除一項。`);
        return;
      }
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCartItems(addCartItem(current, product)));
      window.dispatchEvent(new Event(CART_CHANGE_EVENT));
      setMessage("已加入購物車。");
    } catch {
      setMessage("購物車目前無法更新，請稍後再試。");
    }
  };

  return <div>
    <button type="button" onClick={add} disabled={!canOrder}>{!availabilityConfirmed ? "商品資料確認中" : !orderReady ? "暫未開放訂購" : canOrder ? "加入購物車" : "目前不可訂購"}</button>
    {message && <p role="status">{message} <Link href="/?cart=open">查看購物車 →</Link></p>}
  </div>;
}
