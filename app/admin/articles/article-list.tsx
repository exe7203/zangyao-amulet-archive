"use client";

import { FileText, Plus, Search } from "lucide-react";
import type { Article, ArticleFilter, ArticleListPagination } from "./types";
import { formatUpdatedAt } from "./helpers";
import styles from "./articles.module.css";

export function ArticleList({
  articles,
  draftId,
  loading,
  dirty,
  saving,
  articleQuery,
  articleFilter,
  articleAppliedQuery,
  articleAppliedFilter,
  pagination,
  onQueryChange,
  onFilterChange,
  onSearch,
  onSelect,
  onCreate,
  onPage,
}: {
  articles: Article[];
  draftId: string | null;
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  articleQuery: string;
  articleFilter: ArticleFilter;
  articleAppliedQuery: string;
  articleAppliedFilter: ArticleFilter;
  pagination: ArticleListPagination;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: ArticleFilter) => void;
  onSearch: (query: string, status: ArticleFilter) => void;
  onSelect: (article: Article) => void;
  onCreate: () => void;
  onPage: (page: number) => void;
}) {
  const articleListIsFiltered = Boolean(articleAppliedQuery) || articleAppliedFilter !== "all";

  return (
    <aside className={styles.listPane}>
      <div className={styles.listHead}>
        <div>
          <small>CONTENT</small>
          <h1>文章</h1>
        </div>
        <button type="button" className={styles.addButton} onClick={onCreate} disabled={saving}>
          <Plus size={15} />
          新增
        </button>
      </div>

      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          const query = articleQuery.trim();
          onSearch(query, articleFilter);
        }}
      >
        <label className={styles.searchField}>
          <Search size={14} aria-hidden="true" />
          <span className={styles.srOnly}>搜尋文章</span>
          <input
            value={articleQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜尋標題或網址"
          />
        </label>
        <label>
          <span className={styles.srOnly}>依狀態篩選</span>
          <select
            value={articleFilter}
            onChange={(event) => {
              const status = event.target.value as ArticleFilter;
              onFilterChange(status);
              const query = articleQuery.trim();
              onSearch(query, status);
            }}
          >
            <option value="all">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="published">已發布</option>
            <option value="archived">已封存</option>
          </select>
        </label>
        <button type="submit" className={styles.searchButton} disabled={loading}>
          搜尋
        </button>
      </form>

      <nav className={styles.list} aria-label="文章清單">
        {loading && <p className={styles.listMuted}>正在讀取文章…</p>}
        {!loading && articles.length === 0 && (
          <div className={styles.emptyList}>
            <FileText size={20} />
            <b>
              {articleListIsFiltered
                ? "沒有符合條件的文章"
                : pagination.total > 0
                  ? "此頁沒有文章"
                  : "還沒有文章"}
            </b>
            <span>
              {articleListIsFiltered
                ? "請調整搜尋文字或狀態。"
                : pagination.total > 0
                  ? "請返回上一頁查看內容。"
                  : "按「新增」開始建立第一篇內容。"}
            </span>
          </div>
        )}
        {articles.map((article) => (
          <button
            type="button"
            key={article.id}
            className={`${styles.listItem} ${draftId === article.id ? styles.listItemActive : ""}`}
            onClick={() => onSelect(article)}
            disabled={saving}
          >
            <span className={styles.rowMain}>
              <b>{article.title}</b>
              <small>/{article.slug}</small>
            </span>
            <span className={styles.rowMeta}>
              <span className={`${styles.statusDot} ${styles[`status_${article.status}`]}`} />
              {article.status === "published" ? "已發布" : article.status === "archived" ? "已封存" : "草稿"}
              <time dateTime={article.updatedAt}>{formatUpdatedAt(article.updatedAt)}</time>
            </span>
          </button>
        ))}
      </nav>

      <div className={styles.listFoot}>
        <span>
          共 {pagination.total} 篇 · 第 {pagination.page} / {Math.max(1, pagination.totalPages)} 頁
        </span>
        <div className={styles.pager}>
          <button type="button" onClick={() => onPage(pagination.page - 1)} disabled={loading || dirty || pagination.page <= 1}>
            上一頁
          </button>
          <button
            type="button"
            onClick={() => onPage(pagination.page + 1)}
            disabled={loading || dirty || pagination.totalPages === 0 || pagination.page >= pagination.totalPages}
          >
            下一頁
          </button>
        </div>
      </div>
    </aside>
  );
}
