"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminCategoriesCollectionPath,
  adminCategoriesPath,
  adminCategoryPath,
  adminProductMovementsPath,
  adminProductPath,
  adminProductsPath,
} from "../../../shared/admin/api-paths";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import { validateImagePair } from "../image-field-contract";
import { adminFetch } from "../_lib/api-client";
import { HISTORY_LIMIT, PRODUCT_LIST_LIMIT, SITE_CODE } from "../_lib/constants";
import { emptyCategory, emptyProduct, statusLabel } from "../commerce/helpers";
import type { AdminCategory, AdminProduct, CategoryDraft, InventoryMovement } from "../commerce/types";
import { EMPTY_PAGINATION } from "../commerce/types";
import { CategoryManager } from "./category-manager";
import { InventoryLog } from "./inventory-log";
import { ProductForm, type CatalogTab } from "./product-form";
import { ProductList } from "./product-list";
import styles from "./catalog.module.css";

function readProductStatusFilter(params: { get(name: string): string | null }) {
  const status = params.get("status");
  return status === "draft" || status === "active" || status === "sold_out" || status === "archived"
    ? status
    : "";
}

export default function ProductWorkspace() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [draft, setDraft] = useState<AdminProduct>(emptyProduct);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState(() => readProductStatusFilter(searchParams));
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productPagination, setProductPagination] = useState<AdminPagination>({
    ...EMPTY_PAGINATION,
    limit: PRODUCT_LIST_LIMIT,
    maxLimit: 100,
  });
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementPagination, setMovementPagination] = useState<AdminPagination>(EMPTY_PAGINATION);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementError, setMovementError] = useState("");
  const [tab, setTab] = useState<CatalogTab>(() => {
    const focus = searchParams.get("focus");
    if (focus === "stock") return "inventory";
    if (focus === "seo") return "media";
    return "basic";
  });
  const editRevision = useRef(0);
  const productRequestRevision = useRef(0);
  const movementRequestRevision = useRef(0);
  const queryActionsBootstrapped = useRef(false);

  const loadMovements = useCallback(async (productId: string, page = 1) => {
    if (!productId) {
      movementRequestRevision.current += 1;
      setMovements([]);
      setMovementPagination(EMPTY_PAGINATION);
      setMovementError("");
      setMovementsLoading(false);
      return;
    }
    const requestRevision = ++movementRequestRevision.current;
    setMovements([]);
    setMovementPagination({ ...EMPTY_PAGINATION, page });
    setMovementsLoading(true);
    setMovementError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(HISTORY_LIMIT) });
      const payload = await adminFetch<{ movements?: InventoryMovement[]; pagination?: AdminPagination }>(
        adminProductMovementsPath(productId, params),
      );
      if (movementRequestRevision.current !== requestRevision) return;
      setMovements(payload.movements || []);
      setMovementPagination(payload.pagination || EMPTY_PAGINATION);
    } catch (cause) {
      if (movementRequestRevision.current === requestRevision) {
        setMovementError(cause instanceof Error ? cause.message : "庫存流水讀取失敗");
      }
    } finally {
      if (movementRequestRevision.current === requestRevision) setMovementsLoading(false);
    }
  }, []);

  const productImageError = validateImagePair({
    url: draft.imageUrl || "",
    alt: draft.imageAlt || "",
    urlLabel: "商品主圖 URL",
    altLabel: "主圖替代文字",
  });

  const loadCategories = useCallback(async () => {
    try {
      const payload = await adminFetch<{ categories?: AdminCategory[] }>(adminCategoriesPath(SITE_CODE, "all"));
      setCategories(payload.categories || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分類資料讀取失敗");
    }
  }, []);

  const load = useCallback(
    async (page = 1, preferredId?: string) => {
      const requestRevision = ++productRequestRevision.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(PRODUCT_LIST_LIMIT) });
        if (productQuery.trim()) params.set("q", productQuery.trim());
        if (productStatusFilter) params.set("status", productStatusFilter);
        if (productCategoryFilter) params.set("category", productCategoryFilter);
        const payload = await adminFetch<{ products?: AdminProduct[]; pagination?: AdminPagination }>(
          adminProductsPath(SITE_CODE, params),
        );
        if (productRequestRevision.current !== requestRevision) return;
        const next = (payload.products || []).map((product) => ({
          ...product,
          stock: product.inventory?.onHand ?? product.stock,
        }));
        setProducts(next);
        setProductPagination(
          payload.pagination || { ...EMPTY_PAGINATION, page, limit: PRODUCT_LIST_LIMIT, maxLimit: 100 },
        );
        setDraft(
          (current) =>
            next.find((product) => product.id === preferredId) ||
            next.find((product) => product.id === current.id) ||
            next[0] ||
            emptyProduct(),
        );
        setAdjustmentReason("");
        setDirty(false);
      } catch (cause) {
        if (productRequestRevision.current === requestRevision) {
          setError(cause instanceof Error ? cause.message : "商品資料讀取失敗");
        }
      } finally {
        if (productRequestRevision.current === requestRevision) setLoading(false);
      }
    },
    [productCategoryFilter, productQuery, productStatusFilter],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMovements(draft.id, 1), 0);
    return () => window.clearTimeout(timer);
  }, [draft.id, loadMovements]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (queryActionsBootstrapped.current) return;
    queryActionsBootstrapped.current = true;
    const focus = searchParams.get("focus");
    const createNew = searchParams.get("new") === "1";
    if (focus === "stock") {
      setNotice("請檢查可售數量偏低的商品（可售 ≤ 1），必要時補貨或改為售完。");
    } else if (focus === "seo") {
      setNotice("請補齊 SEO 標題、描述與主圖替代文字，並勾選 SEO 就緒。");
    }
    if (createNew) {
      setDraft(emptyProduct());
      setAdjustmentReason("");
      setDirty(false);
      setError("");
      if (focus !== "stock" && focus !== "seo") {
        setNotice("已開啟空白商品表單，填寫後請儲存。");
      }
    }
  }, [searchParams]);

  const update = <Key extends keyof AdminProduct>(key: Key, value: AdminProduct[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    editRevision.current += 1;
    setDirty(true);
  };

  const selectProduct = (product: AdminProduct) => {
    if (saving) return;
    if (dirty && product.id !== draft.id && !window.confirm("目前商品還有未儲存變更，確定要切換嗎？")) return;
    setDraft(product);
    setAdjustmentReason("");
    setDirty(false);
    setError("");
    setNotice("");
    setTab("basic");
  };

  const createProduct = () => {
    if (saving) return;
    if (dirty && !window.confirm("目前商品還有未儲存變更，確定要建立新商品嗎？")) return;
    setDraft(emptyProduct(categories.find((category) => category.status === "active")));
    setAdjustmentReason("");
    setDirty(false);
    setError("");
    setNotice("");
    setTab("basic");
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.slug.trim() || !draft.sku.trim() || !draft.categoryId) {
      setError("商品名稱、網址 Slug、商品編號與分類不可留白");
      setTab("basic");
      return;
    }
    if (!Number.isSafeInteger(draft.price) || draft.price < 0 || !Number.isSafeInteger(draft.stock) || draft.stock < 0) {
      setError("價格與庫存必須是大於或等於 0 的整數");
      setTab("basic");
      return;
    }
    if (draft.stock < (draft.inventory?.reserved ?? 0)) {
      setError(`實有總數不可低於目前已保留的 ${draft.inventory?.reserved ?? 0} 件`);
      setTab("basic");
      return;
    }
    const stockChanged = Boolean(draft.id && draft.inventory && draft.stock !== draft.inventory.onHand);
    if (stockChanged && adjustmentReason.trim().length < 4) {
      setError("調整實有庫存時，請填寫至少 4 個字的調整原因");
      setTab("basic");
      return;
    }
    if (productImageError) {
      setError(productImageError);
      setTab("media");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const savingRevision = editRevision.current;
    try {
      const { inventory, ...productFields } = draft;
      const payload = await adminFetch<{ product?: AdminProduct }>(adminProductsPath(SITE_CODE), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...productFields,
          adjustmentReason: adjustmentReason.trim(),
          productVersion: draft.version,
          inventoryVersion: inventory?.version,
          siteCode: SITE_CODE,
        }),
      });
      if (!payload.product) throw new Error("商品儲存失敗");
      const saved = payload.product;
      const normalizedSaved = { ...saved, stock: saved.inventory?.onHand ?? saved.stock };
      setProducts((current) => [normalizedSaved, ...current.filter((product) => product.id !== normalizedSaved.id)]);
      if (editRevision.current === savingRevision) {
        setDraft(normalizedSaved);
        setAdjustmentReason("");
        setDirty(false);
        setNotice("商品與庫存資料已儲存");
      } else {
        setDraft((current) => ({
          ...current,
          id: normalizedSaved.id,
          version: normalizedSaved.version,
          inventory: normalizedSaved.inventory,
        }));
        setNotice("已儲存送出時的版本；你後續輸入的內容仍保留，請再次儲存。");
      }
      await loadMovements(normalizedSaved.id, 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "商品儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!draft.id || !window.confirm(`確定封存「${draft.name}」嗎？`)) return;
    setSaving(true);
    setError("");
    try {
      await adminFetch(`${adminProductPath(draft.id)}?site=${SITE_CODE}&version=${draft.version}`, { method: "DELETE" });
      setNotice("商品已封存，不再顯示於前台");
      await load(productPagination.page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "商品封存失敗");
    } finally {
      setSaving(false);
    }
  };

  const openCategoryManager = (category?: AdminCategory) => {
    setCategoryDraft(
      category
        ? {
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            sortOrder: category.sortOrder,
            status: category.status,
            updatedAt: category.updatedAt,
          }
        : emptyCategory(),
    );
    setCategoryError("");
    setCategoryManagerOpen(true);
  };

  const saveCategory = async (nextStatus = categoryDraft.status) => {
    if (!categoryDraft.name.trim() || !categoryDraft.slug.trim()) {
      setCategoryError("分類名稱與網址 Slug 不可留白");
      return;
    }
    if (!Number.isSafeInteger(categoryDraft.sortOrder) || categoryDraft.sortOrder < 0) {
      setCategoryError("排序必須是大於或等於 0 的整數");
      return;
    }
    const currentCategory = categories.find((category) => category.id === categoryDraft.id);
    if (
      currentCategory?.status === "active" &&
      nextStatus === "archived" &&
      currentCategory.productCount > 0 &&
      !window.confirm(`封存後，此分類下的 ${currentCategory.productCount} 件商品會停止在前台顯示。確定繼續嗎？`)
    ) {
      return;
    }
    setCategorySaving(true);
    setCategoryError("");
    try {
      const editing = Boolean(categoryDraft.id);
      const payload = await adminFetch<{ category?: AdminCategory }>(
        editing ? adminCategoryPath(categoryDraft.id) : adminCategoriesCollectionPath(),
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            siteCode: SITE_CODE,
            name: categoryDraft.name,
            slug: categoryDraft.slug,
            description: categoryDraft.description,
            sortOrder: categoryDraft.sortOrder,
            status: nextStatus,
            ...(editing ? { expectedUpdatedAt: categoryDraft.updatedAt } : {}),
          }),
        },
      );
      if (!payload.category) throw new Error("分類儲存失敗");
      setCategoryDraft({
        id: payload.category.id,
        slug: payload.category.slug,
        name: payload.category.name,
        description: payload.category.description,
        sortOrder: payload.category.sortOrder,
        status: payload.category.status,
        updatedAt: payload.category.updatedAt,
      });
      await loadCategories();
      await load(productPagination.page, draft.id);
      setNotice(nextStatus === "archived" ? "分類已封存" : "分類資料已儲存");
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : "分類儲存失敗");
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!categoryDraft.id || !window.confirm(`確定刪除分類「${categoryDraft.name}」嗎？仍有商品使用時系統會拒絕刪除。`)) {
      return;
    }
    setCategorySaving(true);
    setCategoryError("");
    try {
      await adminFetch(adminCategoryPath(categoryDraft.id), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteCode: SITE_CODE, expectedUpdatedAt: categoryDraft.updatedAt }),
      });
      const deletedId = categoryDraft.id;
      setCategoryDraft(emptyCategory());
      await loadCategories();
      if (productCategoryFilter === deletedId) setProductCategoryFilter("");
      setNotice("未被商品使用的分類已刪除");
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : "分類刪除失敗");
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <AdminTopbar active="products" hasUnsavedChanges={dirty}>
      <div className={styles.workspace}>
        <ProductList
          products={products}
          categories={categories}
          selectedId={draft.id}
          loading={loading}
          dirty={dirty}
          saving={saving}
          query={productQuery}
          statusFilter={productStatusFilter}
          categoryFilter={productCategoryFilter}
          pagination={productPagination}
          onQuery={setProductQuery}
          onStatusFilter={setProductStatusFilter}
          onCategoryFilter={setProductCategoryFilter}
          onSelect={selectProduct}
          onCreate={createProduct}
          onOpenCategories={() => openCategoryManager()}
          onPage={(page) => void load(page)}
        />

        <section className={styles.mainPane}>
          <AdminActionBar
            status={
              <AdminStatus
                tone={
                  draft.status === "active"
                    ? "success"
                    : draft.status === "sold_out"
                      ? "danger"
                      : draft.status === "draft"
                        ? "warning"
                        : "neutral"
                }
              >
                {statusLabel(draft.status)}
              </AdminStatus>
            }
            title={draft.shortName || draft.name || "新商品"}
            detail={dirty ? "尚有未儲存變更" : draft.id ? "商品與庫存資料已儲存" : "尚未儲存的新商品"}
          >
            {draft.id && (
              <AdminButton type="button" variant="danger" onClick={() => void archive()} disabled={saving}>
                封存
              </AdminButton>
            )}
            <AdminButton type="button" variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? "處理中…" : "儲存商品"}
            </AdminButton>
          </AdminActionBar>

          {(error || notice) && (
            <div className={`${styles.banner} ${error ? styles.bannerError : styles.bannerNotice}`} role="status">
              {error || notice}
            </div>
          )}

          {tab === "inventory" ? (
            <InventoryLog
              productId={draft.id}
              movements={movements}
              pagination={movementPagination}
              loading={movementsLoading}
              error={movementError}
              onRefresh={() => void loadMovements(draft.id, movementPagination.page)}
              onPage={(page) => void loadMovements(draft.id, page)}
            />
          ) : (
            <ProductForm
              tab={tab}
              draft={draft}
              categories={categories}
              adjustmentReason={adjustmentReason}
              productImageError={productImageError}
              onTab={setTab}
              onUpdate={update}
              onAdjustmentReason={(value) => {
                setAdjustmentReason(value);
                editRevision.current += 1;
                setDirty(true);
              }}
            />
          )}
        </section>
      </div>

      {categoryManagerOpen && (
        <CategoryManager
          categories={categories}
          draft={categoryDraft}
          saving={categorySaving}
          error={categoryError}
          onClose={() => setCategoryManagerOpen(false)}
          onSelect={openCategoryManager}
          onCreate={() => {
            setCategoryDraft(emptyCategory());
            setCategoryError("");
          }}
          onChange={setCategoryDraft}
          onSave={() => void saveCategory()}
          onArchive={() => void saveCategory("archived")}
          onDelete={() => void deleteCategory()}
        />
      )}
    </AdminTopbar>
  );
}
