"use client";

import { Plus } from "lucide-react";
import type { AdminCategory, CategoryDraft } from "../commerce/types";
import { Field } from "./field";
import styles from "./catalog.module.css";

export function CategoryManager({
  categories,
  draft,
  saving,
  error,
  onClose,
  onSelect,
  onCreate,
  onChange,
  onSave,
  onArchive,
  onDelete,
}: {
  categories: AdminCategory[];
  draft: CategoryDraft;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSelect: (category: AdminCategory) => void;
  onCreate: () => void;
  onChange: (next: CategoryDraft) => void;
  onSave: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const currentCount = categories.find((category) => category.id === draft.id)?.productCount || 0;

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
        <header>
          <div>
            <small>分類管理</small>
            <h2 id="category-manager-title">商品分類管理</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉分類管理">
            ×
          </button>
        </header>
        <div className={styles.dialogBody}>
          <nav className={styles.categoryList} aria-label="商品分類清單">
            <button type="button" className={!draft.id ? styles.categorySelected : ""} onClick={onCreate}>
              <Plus size={14} />
              新增分類
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={category.id === draft.id ? styles.categorySelected : ""}
                onClick={() => onSelect(category)}
              >
                <b>{category.name}</b>
                <small>
                  {category.productCount} 件商品 · {category.status === "active" ? "啟用" : "已封存"}
                </small>
              </button>
            ))}
          </nav>
          <div className={styles.categoryForm}>
            <div className={styles.grid2}>
              <Field label="分類名稱">
                <input
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field label="網址 Slug">
                <input
                  maxLength={120}
                  value={draft.slug}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                />
              </Field>
              <Field label="排序">
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  value={draft.sortOrder}
                  onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}
                />
              </Field>
              <Field label="狀態">
                <select
                  value={draft.status}
                  onChange={(event) =>
                    onChange({ ...draft, status: event.target.value as AdminCategory["status"] })
                  }
                >
                  <option value="active">啟用</option>
                  <option value="archived">已封存</option>
                </select>
              </Field>
            </div>
            <Field label="分類說明">
              <textarea
                rows={4}
                maxLength={500}
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
              />
            </Field>
            {error && (
              <p className={styles.fieldError} role="status">
                {error}
              </p>
            )}
            <div className={styles.categoryActions}>
              <span>{draft.id ? `目前有 ${currentCount} 件商品` : "建立後即可指派給商品"}</span>
              <div>
                {draft.id && (
                  <button type="button" className={styles.deleteCategory} onClick={onDelete} disabled={saving}>
                    刪除
                  </button>
                )}
                {draft.id && draft.status === "active" && (
                  <button type="button" onClick={onArchive} disabled={saving}>
                    封存
                  </button>
                )}
                <button type="button" className={styles.saveCategory} onClick={onSave} disabled={saving}>
                  {saving ? "處理中…" : "儲存分類"}
                </button>
              </div>
            </div>
            <p className={styles.helper}>
              仍被商品使用的分類不能刪除；可先移動商品，或將分類封存。每次更新都會核對你畫面上的版本，避免覆蓋他人的修改。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
