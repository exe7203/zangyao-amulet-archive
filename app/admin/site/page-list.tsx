"use client";

import { Plus, Search } from "lucide-react";
import type { PageRecord } from "../../site-builder/types";
import {
  formatUpdatedAt,
  statusLabel,
  type PageFilter,
  type PageListPagination,
} from "./helpers";
import styles from "./site-editor.module.css";

export function PageList({
  pages,
  draft,
  loading,
  pageQuery,
  pageFilter,
  pageAppliedQuery,
  pageAppliedFilter,
  pagination,
  onQueryChange,
  onFilterChange,
  onSearch,
  onSelect,
  onCreate,
  onPage,
}: {
  pages: PageRecord[];
  draft: PageRecord;
  loading: boolean;
  pageQuery: string;
  pageFilter: PageFilter;
  pageAppliedQuery: string;
  pageAppliedFilter: PageFilter;
  pagination: PageListPagination;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: PageFilter) => void;
  onSearch: (query: string, status: PageFilter) => void;
  onSelect: (page: PageRecord) => void;
  onCreate: () => void;
  onPage: (page: number) => void;
}) {
  const pageListIsFiltered = Boolean(pageAppliedQuery) || pageAppliedFilter !== "all";

  return (
    <aside className={styles.pageSidebar}>
      <div className={styles.sidebarHead}>
        <div>
          <small>PAGES · {pagination.total}</small>
          <h1>網站頁面</h1>
        </div>
        <button type="button" onClick={onCreate}>
          <Plus size={14} />
          新增
        </button>
      </div>
      <form
        className={styles.pageFilters}
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(pageQuery.trim(), pageFilter);
        }}
      >
        <label className={styles.pageSearchField}>
          <Search size={14} aria-hidden="true" />
          <span className={styles.srOnly}>搜尋網站頁面</span>
          <input
            value={pageQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜尋名稱或網址"
          />
        </label>
        <label>
          <span className={styles.srOnly}>依狀態篩選頁面</span>
          <select
            value={pageFilter}
            onChange={(event) => {
              const status = event.target.value as PageFilter;
              onFilterChange(status);
              onSearch(pageQuery.trim(), status);
            }}
          >
            <option value="all">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="published">已發布</option>
            <option value="archived">已封存</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>
          搜尋
        </button>
      </form>
      <div className={styles.pageList}>
        {loading && <p className={styles.muted}>正在讀取頁面…</p>}
        {!loading && pages.length === 0 && (
          <div className={styles.emptyList}>
            <b>
              {pageListIsFiltered
                ? "沒有符合條件的頁面"
                : pagination.total > 0
                  ? "此頁沒有內容"
                  : "還沒有自訂頁面"}
            </b>
            <span>
              {pageListIsFiltered
                ? "請調整搜尋文字或狀態。"
                : pagination.total > 0
                  ? "請返回上一頁查看內容。"
                  : "按右上角的＋建立第一頁。"}
            </span>
          </div>
        )}
        {pages.map((page) => (
          <button
            type="button"
            key={page.id}
            className={page.id === draft.id ? styles.selectedPage : ""}
            onClick={() => onSelect(page)}
          >
            <span className={`${styles.statusDot} ${styles[`status_${page.status}`]}`} />
            <span>
              <b>{page.title}</b>
              <small>
                /{page.slug}/ · {statusLabel(page.status)}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.sidebarFoot}>
        <div className={styles.pageCount}>
          <span>共 {pagination.total} 頁</span>
          <span>
            第 {pagination.page} / {Math.max(1, pagination.totalPages)} 頁
          </span>
        </div>
        <div className={styles.sidebarPager}>
          <button type="button" onClick={() => onPage(pagination.page - 1)} disabled={loading || pagination.page <= 1}>
            上一頁
          </button>
          <button
            type="button"
            onClick={() => onPage(pagination.page + 1)}
            disabled={loading || pagination.totalPages === 0 || pagination.page >= pagination.totalPages}
          >
            下一頁
          </button>
        </div>
        <span>目前頁面最後更新</span>
        <b>{formatUpdatedAt(draft.updatedAt)}</b>
        <small>版本 {draft.version}</small>
      </div>
    </aside>
  );
}
