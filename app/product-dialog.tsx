"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Product } from "./data";
import { formatPrice } from "./data";
import ProductArtwork from "./product-artwork";
import { useModalFocus } from "./use-modal-focus";

export default function ProductDialog({
  product,
  canOrder,
  detailsConfirmed,
  onClose,
  onAdd,
}: {
  product: Product | null;
  canOrder: boolean;
  detailsConfirmed: boolean;
  onClose(): void;
  onAdd(product: Product): void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(Boolean(product), panelRef, closeRef, onClose);

  if (!product) return null;
  const orderAvailable = canOrder && product.status === "active" && product.stock > 0;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="關閉商品詳情" tabIndex={-1} />
      <div className="product-modal" ref={panelRef} tabIndex={-1}>
        <button ref={closeRef} className="modal-close icon-button" onClick={onClose} aria-label="關閉商品詳情">×</button>
        <div className="modal-visual"><ProductArtwork product={product} large /></div>
        <div className="modal-copy">
          <p className="eyebrow eyebrow--dark">商品資料{detailsConfirmed && product.badge ? ` · ${product.badge}` : ""}</p>
          <h2 id="product-modal-title">{product.name}</h2>
          <p className="modal-price">{detailsConfirmed ? formatPrice(product.price) : "價格確認中"}</p>
          <p className="modal-description">{detailsConfirmed ? product.description : "商品資料整理中，完成確認後會更新照片、規格與來源說明。"}</p>
          <dl>
            <div><dt>商品編號</dt><dd>{product.sku}</dd></div>
            {detailsConfirmed && <>
              <div><dt>來源地區</dt><dd>{product.origin}</dd></div>
              <div><dt>寺院／發行單位</dt><dd>{product.temple}</dd></div>
              <div><dt>年份</dt><dd>{product.buddhistYear}（{product.westernYear}）</dd></div>
              <div><dt>材質</dt><dd>{product.material}</dd></div>
              <div><dt>尺寸</dt><dd>{product.dimensions}</dd></div>
            </>}
            <div><dt>庫存狀態</dt><dd>{orderAvailable ? `現貨 ${product.stock} 件` : detailsConfirmed ? "目前不可訂購" : "確認中"}</dd></div>
          </dl>
          <div className="modal-actions">
            <button className="button button--dark" onClick={() => onAdd(product)} disabled={!orderAvailable}>{orderAvailable ? "加入購物車" : "暫未開放訂購"}</button>
            <Link className="text-link" href={`/products/${product.slug}/`}>查看商品詳情 ↗</Link>
          </div>
          <small className="faith-note">佛牌與相關收藏品具有宗教與文化背景，本店不宣稱或保證特定效果。</small>
        </div>
      </div>
    </div>
  );
}
