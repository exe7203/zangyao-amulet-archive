"use client";

import type { Product } from "../../data";
import ProductArtwork from "../../product-artwork";
import {
  ADMIN_IMAGE_ALT_MAX_LENGTH,
  ADMIN_IMAGE_URL_MAX_LENGTH,
} from "../image-field-contract";
import { inventoryBreakdown } from "../commerce/helpers";
import type { AdminCategory, AdminProduct } from "../commerce/types";
import { Field } from "./field";
import styles from "./catalog.module.css";

export type CatalogTab = "basic" | "specs" | "media" | "inventory";

export function ProductForm({
  tab,
  draft,
  categories,
  adjustmentReason,
  productImageError,
  onTab,
  onUpdate,
  onAdjustmentReason,
}: {
  tab: CatalogTab;
  draft: AdminProduct;
  categories: AdminCategory[];
  adjustmentReason: string;
  productImageError: string | null;
  onTab: (tab: CatalogTab) => void;
  onUpdate: <Key extends keyof AdminProduct>(key: Key, value: AdminProduct[Key]) => void;
  onAdjustmentReason: (value: string) => void;
}) {
  const inventory = inventoryBreakdown(draft);
  const stockChanged = Boolean(draft.id && draft.inventory && draft.stock !== draft.inventory.onHand);

  return (
    <div className={styles.editorBody}>
      <div className={styles.tabs} role="tablist" aria-label="商品編輯區塊">
        {(
          [
            ["basic", "基本資料"],
            ["specs", "來源規格"],
            ["media", "圖片與 SEO"],
            ["inventory", "庫存流水"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "basic" && (
        <section className={styles.panel}>
          <h2>基本資料</h2>
          <p className={styles.panelLead}>名稱、價格、狀態與實有庫存。改庫存時必須填寫調整原因。</p>
          <div className={styles.grid2}>
            <Field label="商品全名">
              <input value={draft.name} onChange={(event) => onUpdate("name", event.target.value)} />
            </Field>
            <Field label="前台短名">
              <input value={draft.shortName} onChange={(event) => onUpdate("shortName", event.target.value)} />
            </Field>
            <Field label="商品編號／SKU">
              <input value={draft.sku} onChange={(event) => onUpdate("sku", event.target.value.toUpperCase())} />
            </Field>
            <Field label="網址 Slug">
              <input
                value={draft.slug}
                onChange={(event) => onUpdate("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              />
            </Field>
            <Field label="分類">
              <select
                value={draft.categoryId || ""}
                onChange={(event) => {
                  const category = categories.find((candidate) => candidate.id === event.target.value);
                  onUpdate("categoryId", category?.id);
                  onUpdate("category", category?.name || "");
                }}
              >
                <option value="">請選擇分類</option>
                {categories
                  .filter((category) => category.status === "active" || category.id === draft.categoryId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.status === "archived" ? "（已封存，請改選）" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="狀態">
              <select value={draft.status} onChange={(event) => onUpdate("status", event.target.value as Product["status"])}>
                <option value="draft">草稿</option>
                <option value="active">上架中</option>
                <option value="sold_out">售罄</option>
                <option value="archived">封存</option>
              </select>
            </Field>
            <Field label="售價（TWD）">
              <input type="number" min="0" step="1" value={draft.price} onChange={(event) => onUpdate("price", Number(event.target.value))} />
            </Field>
            <Field label="實有總數（含訂單保留）">
              <input
                type="number"
                min={draft.inventory?.reserved ?? 0}
                step="1"
                value={draft.stock}
                onChange={(event) => onUpdate("stock", Number(event.target.value))}
              />
            </Field>
            <Field label="每筆限購">
              <input
                type="number"
                min="1"
                step="1"
                value={draft.purchaseLimit || 1}
                onChange={(event) => onUpdate("purchaseLimit", Number(event.target.value))}
              />
            </Field>
            <Field label="前台標籤">
              <input value={draft.badge} onChange={(event) => onUpdate("badge", event.target.value)} />
            </Field>
          </div>

          {stockChanged && (
            <Field label="庫存調整原因">
              <input
                value={adjustmentReason}
                maxLength={300}
                onChange={(event) => onAdjustmentReason(event.target.value)}
                placeholder="例如：盤點補入 2 件、瑕疵報廢 1 件"
              />
              <p className={styles.helper}>庫存有異動時必填，至少 4 個字；原因會保存在庫存流水。</p>
            </Field>
          )}

          <div className={styles.inventoryCards} aria-label="庫存拆分">
            <div>
              <span>實有 onHand</span>
              <b>{inventory.onHand}</b>
            </div>
            <div>
              <span>訂單保留 reserved</span>
              <b>{inventory.reserved}</b>
            </div>
            <div>
              <span>可用 available</span>
              <b>{inventory.available}</b>
            </div>
          </div>
          <p className={styles.helper}>
            可用數量＝實有總數－訂單保留；商品同時為「上架中」時，才會成為前台可售上限。已保留數量由訂單流程管理，不能在商品欄位直接改動。
          </p>

          <Field label="商品說明">
            <textarea rows={5} value={draft.description} onChange={(event) => onUpdate("description", event.target.value)} />
          </Field>
        </section>
      )}

      {tab === "specs" && (
        <section className={styles.panel}>
          <h2>來源與規格</h2>
          <p className={styles.panelLead}>佛牌來源、年份與形制，會顯示在商品詳情頁。</p>
          <div className={styles.grid2}>
            <Field label="來源地區">
              <input value={draft.origin} onChange={(event) => onUpdate("origin", event.target.value)} />
            </Field>
            <Field label="寺院／來源">
              <input value={draft.temple} onChange={(event) => onUpdate("temple", event.target.value)} />
            </Field>
            <Field label="佛曆年份">
              <input value={draft.buddhistYear} onChange={(event) => onUpdate("buddhistYear", event.target.value)} />
            </Field>
            <Field label="西元年份">
              <input value={draft.westernYear} onChange={(event) => onUpdate("westernYear", event.target.value)} />
            </Field>
            <Field label="材質">
              <input value={draft.material} onChange={(event) => onUpdate("material", event.target.value)} />
            </Field>
            <Field label="尺寸">
              <input value={draft.dimensions} onChange={(event) => onUpdate("dimensions", event.target.value)} />
            </Field>
            <Field label="文化主題">
              <input value={draft.theme} onChange={(event) => onUpdate("theme", event.target.value)} />
            </Field>
            <Field label="外觀形制">
              <select value={draft.shape} onChange={(event) => onUpdate("shape", event.target.value as Product["shape"])}>
                <option value="arch">拱形</option>
                <option value="oval">橢圓</option>
                <option value="round">圓形</option>
                <option value="statue">神尊</option>
              </select>
            </Field>
          </div>
        </section>
      )}

      {tab === "media" && (
        <section className={styles.panel}>
          <h2>圖片與 SEO</h2>
          <p className={styles.panelLead}>暫請貼公開圖片網址。勾選搜尋收錄前，請確認主圖、替代文字與 SEO 欄位完整。</p>
          <div className={styles.imagePreview}>
            <ProductArtwork key={`${draft.id || "new"}:${draft.imageUrl || ""}`} product={draft as Product} large />
          </div>
          <p className={styles.helper}>安全預覽會使用前台相同規則；網址無效或圖片載入失敗時顯示藏品示意圖。</p>
          <Field label="商品主圖 URL">
            <input
              type="url"
              value={draft.imageUrl || ""}
              maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
              aria-invalid={Boolean(productImageError)}
              onChange={(event) => onUpdate("imageUrl", event.target.value)}
              placeholder="https://..."
            />
            <small className={styles.counter}>
              {(draft.imageUrl || "").length}/{ADMIN_IMAGE_URL_MAX_LENGTH}
            </small>
          </Field>
          <Field label="主圖替代文字">
            <input
              value={draft.imageAlt || ""}
              maxLength={ADMIN_IMAGE_ALT_MAX_LENGTH}
              aria-invalid={Boolean(productImageError)}
              onChange={(event) => onUpdate("imageAlt", event.target.value)}
              placeholder="清楚描述實拍商品與角度"
            />
            <small className={styles.counter}>
              {(draft.imageAlt || "").length}/{ADMIN_IMAGE_ALT_MAX_LENGTH}
            </small>
          </Field>
          {productImageError && (
            <p className={styles.fieldError} role="status">
              {productImageError}
            </p>
          )}
          <Field label="SEO 標題">
            <input value={draft.seoTitle} onChange={(event) => onUpdate("seoTitle", event.target.value)} />
          </Field>
          <Field label="Meta 描述">
            <textarea rows={4} value={draft.seoDescription} onChange={(event) => onUpdate("seoDescription", event.target.value)} />
          </Field>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={draft.seoReady === true}
              onChange={(event) => onUpdate("seoReady", event.target.checked)}
            />
            <span>商品、圖片與 SEO 資料已確認，可同步到公開索引</span>
          </label>
          <p className={styles.helper}>
            勾選前必須有公開主圖與替代文字、至少 8 字 SEO 標題及 50 字 Meta 描述；公開建置仍需開啟商品收錄設定。
          </p>
        </section>
      )}
    </div>
  );
}
