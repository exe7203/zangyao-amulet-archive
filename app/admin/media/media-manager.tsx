"use client";

import { Copy, ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminMediaAssetPath,
  adminMediaPath,
} from "../../../shared/admin/api-paths";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import { adminFetch, AdminFetchError } from "../_lib/api-client";
import { SITE_CODE } from "../_lib/constants";
import styles from "./media.module.css";

type MediaAsset = {
  id: string;
  contentType: string;
  byteSize: number;
  altText: string;
  purpose: string;
  status: string;
  createdAt: string;
  url: string;
};

const EMPTY_PAGINATION: AdminPagination = {
  page: 1,
  limit: 40,
  maxLimit: 100,
  total: 0,
  totalPages: 1,
  returned: 0,
};

const PURPOSE_LABELS: Record<string, string> = {
  product: "商品",
  article: "文章",
  site: "網站",
  shipping_label: "出貨標籤",
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function dateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function MediaManager() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>(EMPTY_PAGINATION);
  const [purposeFilter, setPurposeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(true);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [altText, setAltText] = useState("");
  const [purpose, setPurpose] = useState("product");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRequestId = useRef(0);

  const loadAssets = useCallback(async (page = 1) => {
    const requestId = listRequestId.current + 1;
    listRequestId.current = requestId;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        site: SITE_CODE,
        page: String(page),
        limit: String(pagination.limit),
        status: "ready",
      });
      if (purposeFilter) params.set("purpose", purposeFilter);
      const payload = await adminFetch<{ assets?: MediaAsset[]; pagination?: Partial<AdminPagination> }>(
        adminMediaPath(SITE_CODE, params),
      );
      if (requestId !== listRequestId.current) return;
      const nextAssets = payload.assets || [];
      setAssets(nextAssets);
      setStorageReady(true);
      setPagination({
        page: payload.pagination?.page || page,
        limit: payload.pagination?.limit || pagination.limit,
        maxLimit: payload.pagination?.maxLimit || EMPTY_PAGINATION.maxLimit,
        total: payload.pagination?.total || nextAssets.length,
        totalPages: payload.pagination?.totalPages || 1,
        returned: payload.pagination?.returned || nextAssets.length,
      });
      if (!nextAssets.some((asset) => asset.id === selectedId)) {
        setSelectedId(nextAssets[0]?.id || "");
      }
    } catch (cause) {
      if (requestId !== listRequestId.current) return;
      if (cause instanceof AdminFetchError && cause.status === 503) {
        setStorageReady(false);
        setError("媒體上傳暫不啟用。請在商品或文章欄位直接貼公開圖片網址。");
      } else {
        setError(cause instanceof Error ? cause.message : "媒體清單讀取失敗");
      }
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [pagination.limit, purposeFilter, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAssets(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  const selected = assets.find((asset) => asset.id === selectedId) || null;

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("purpose", purpose);
      formData.set("altText", altText.trim());
      const params = new URLSearchParams({ site: SITE_CODE });
      const payload = await adminFetch<{ asset?: MediaAsset; deduplicated?: boolean }>(
        adminMediaPath(SITE_CODE, params),
        { method: "POST", body: formData },
      );
      if (!payload.asset) throw new Error("上傳完成但未收到媒體資料");
      setNotice(payload.deduplicated ? "已使用既有相同檔案，未重複儲存。" : "圖片已上傳。");
      setAltText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadAssets(1);
      setSelectedId(payload.asset.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "圖片上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm("確定要刪除這張媒體嗎？若仍被商品引用會無法刪除。")) return;
    setDeletingId(selected.id);
    setError("");
    setNotice("");
    try {
      await adminFetch(adminMediaAssetPath(selected.id, SITE_CODE), { method: "DELETE" });
      setNotice("媒體已標記刪除。");
      await loadAssets(pagination.page);
    } catch (cause) {
      setError(cause instanceof AdminFetchError ? cause.message : "媒體刪除失敗");
    } finally {
      setDeletingId("");
    }
  };

  const copyUrl = async () => {
    if (!selected?.url) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      setNotice("公開網址已複製。");
    } catch {
      setError("無法複製網址，請手動選取。");
    }
  };

  return (
    <AdminTopbar active="media" onRefresh={() => void loadAssets(pagination.page)} refreshing={loading || uploading}>
      <div className={styles.workspace}>
        <aside className={styles.listPane}>
          <div className={styles.listHead}>
            <div>
              <small>MEDIA</small>
              <h1>媒體庫</h1>
            </div>
            {storageReady && (
              <button
                type="button"
                className={styles.uploadButton}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                {uploading ? "上傳中…" : "上傳"}
              </button>
            )}
          </div>

          {!storageReady && (
            <p className={styles.noticeBox}>
              媒體上傳（R2）目前暫不啟用。請到「商品與庫存」或「文章」編輯器，在圖片欄位貼上公開圖片網址。
            </p>
          )}

          <div className={styles.filters}>
            <label>
              <span>用途篩選</span>
              <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value)}>
                <option value="">全部</option>
                <option value="product">商品</option>
                <option value="article">文章</option>
                <option value="site">網站</option>
              </select>
            </label>
            {storageReady && (
              <>
                <label>
                  <span>上傳用途</span>
                  <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                    <option value="product">商品</option>
                    <option value="article">文章</option>
                    <option value="site">網站</option>
                  </select>
                </label>
                <label>
                  <span>替代文字</span>
                  <input
                    value={altText}
                    onChange={(event) => setAltText(event.target.value)}
                    placeholder="選填"
                    maxLength={300}
                  />
                </label>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />

          <div className={styles.list}>
            {loading && <p className={styles.listMuted}>讀取中…</p>}
            {!loading && assets.length === 0 && (
              <p className={styles.listMuted}>{storageReady ? "尚無上傳圖片。" : "目前沒有可管理的上傳媒體。"}</p>
            )}
            {assets.map((asset) => (
              <button
                type="button"
                className={`${styles.listItem} ${asset.id === selectedId ? styles.listItemActive : ""}`}
                key={asset.id}
                onClick={() => setSelectedId(asset.id)}
              >
                <span className={styles.dot} />
                <span className={styles.rowMain}>
                  <b>{asset.altText || asset.id}</b>
                  <small>
                    {PURPOSE_LABELS[asset.purpose] || asset.purpose} · {formatBytes(asset.byteSize)}
                  </small>
                  <small>{dateTime(asset.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>

          <div className={styles.listFoot}>
            <span>
              顯示 {pagination.returned} / {pagination.total} 筆
            </span>
            <div className={styles.pager}>
              <button
                type="button"
                onClick={() => void loadAssets(pagination.page - 1)}
                disabled={loading || pagination.page <= 1}
              >
                上一頁
              </button>
              <span>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => void loadAssets(pagination.page + 1)}
                disabled={loading || pagination.page >= pagination.totalPages}
              >
                下一頁
              </button>
            </div>
          </div>
        </aside>

        <section className={styles.mainPane}>
          <AdminActionBar
            status={
              <AdminStatus tone={error ? "danger" : notice ? "success" : "neutral"}>
                {error || notice || `${pagination.total} 筆可用媒體`}
              </AdminStatus>
            }
            title={selected?.altText || "媒體詳情"}
            detail={
              selected
                ? `${PURPOSE_LABELS[selected.purpose] || selected.purpose} · ${formatBytes(selected.byteSize)}`
                : "選擇左側媒體以預覽"
            }
          >
            {selected && (
              <>
                <AdminButton type="button" variant="ghost" onClick={() => void copyUrl()}>
                  <Copy size={15} />
                  複製網址
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="danger"
                  disabled={deletingId === selected.id}
                  onClick={() => void deleteSelected()}
                >
                  <Trash2 size={15} />
                  {deletingId === selected.id ? "刪除中…" : "刪除"}
                </AdminButton>
              </>
            )}
            <AdminButton type="button" variant="ghost" onClick={() => void loadAssets(pagination.page)} disabled={loading}>
              <RefreshCw size={15} />
              重新整理
            </AdminButton>
          </AdminActionBar>

          {selected ? (
            <div className={styles.detail}>
              <section className={styles.panel}>
                <h2>
                  <ImageIcon size={16} /> 預覽
                </h2>
                <div className={styles.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.url} alt={selected.altText || "媒體預覽"} />
                </div>
                <p className={styles.helper}>複製公開網址後，可在商品或文章的圖片欄位貼上使用。</p>
              </section>
              <section className={styles.panel}>
                <h2>媒體資訊</h2>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>用途</span>
                    <input readOnly value={PURPOSE_LABELS[selected.purpose] || selected.purpose} />
                  </label>
                  <label className={styles.field}>
                    <span>格式</span>
                    <input readOnly value={selected.contentType} />
                  </label>
                  <label className={styles.field}>
                    <span>大小</span>
                    <input readOnly value={formatBytes(selected.byteSize)} />
                  </label>
                  <label className={styles.field}>
                    <span>建立時間</span>
                    <input readOnly value={dateTime(selected.createdAt)} />
                  </label>
                  <label className={styles.field}>
                    <span>公開網址</span>
                    <input readOnly value={selected.url} />
                  </label>
                </div>
              </section>
            </div>
          ) : (
            <div className={styles.empty}>
              <ImageIcon size={28} />
              <h2>尚未選擇媒體</h2>
              <p>
                {storageReady
                  ? "上傳商品實拍或文章配圖後，可在這裡複製公開網址。"
                  : "目前改用公開圖片網址；R2 上傳就緒後可在此管理檔案。"}
              </p>
            </div>
          )}
        </section>
      </div>
    </AdminTopbar>
  );
}
