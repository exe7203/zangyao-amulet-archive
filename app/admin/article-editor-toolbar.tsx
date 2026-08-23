"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code2,
  Columns3,
  Eraser,
  ImagePlus,
  Italic,
  Link2,
  List as BulletListIcon,
  ListOrdered,
  Minus,
  PanelTop,
  Plus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import {
  ARTICLE_IMAGE_ALT_MAX_LENGTH,
  ARTICLE_IMAGE_CAPTION_MAX_LENGTH,
  ARTICLE_IMAGE_URL_MAX_LENGTH,
  ARTICLE_TABLE_MAX_COLUMNS,
  ARTICLE_TABLE_MAX_ROWS,
  safeArticleImageSrc,
  safeArticleLinkHref,
} from "../../lib/article-content-contract";
import styles from "./article-editor-toolbar.module.css";

type ToolButtonProps = {
  active?: boolean;
  disabled?: boolean;
  toggle?: boolean;
  expanded?: boolean;
  controls?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  label: string;
  shortcut?: string;
  onClick(): void;
  children: ReactNode;
};

function ToolButton({ active = false, disabled = false, toggle = false, expanded, controls, buttonRef, label, shortcut, onClick, children }: ToolButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={active ? styles.active : undefined}
      disabled={disabled}
      aria-label={label}
      aria-pressed={toggle ? active : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      title={shortcut ? `${label} · ${shortcut}` : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function currentBlock(editor: Editor | null) {
  if (!editor) return "paragraph";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  if (editor.isActive("heading", { level: 4 })) return "heading-4";
  return "paragraph";
}

function currentTableSize(editor: Editor | null) {
  if (!editor) return { rows: 0, columns: 0, rowIndex: -1 };
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "table") continue;
    return {
      rows: node.childCount,
      columns: node.childCount > 0 ? node.child(0).childCount : 0,
      rowIndex: $from.index(depth),
    };
  }
  return { rows: 0, columns: 0, rowIndex: -1 };
}

export default function ArticleEditorToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageError, setImageError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const linkPopover = useRef<HTMLFormElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const imagePopover = useRef<HTMLFormElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const tableSize = currentTableSize(current);
      return {
        block: currentBlock(current),
        bold: Boolean(current?.isActive("bold")),
        italic: Boolean(current?.isActive("italic")),
        underline: Boolean(current?.isActive("underline")),
        strike: Boolean(current?.isActive("strike")),
        code: Boolean(current?.isActive("code")),
        bulletList: Boolean(current?.isActive("bulletList")),
        orderedList: Boolean(current?.isActive("orderedList")),
        blockquote: Boolean(current?.isActive("blockquote")),
        codeBlock: Boolean(current?.isActive("codeBlock")),
        link: Boolean(current?.isActive("link")),
        image: Boolean(current?.isActive("image")),
        table: Boolean(current?.isActive("table")),
        tableHeader: Boolean(current?.isActive("tableHeader")),
        tableRows: tableSize.rows,
        tableColumns: tableSize.columns,
        tableRowIndex: tableSize.rowIndex,
        canAddRow: Boolean(current?.can().addRowAfter()),
        canDeleteRow: Boolean(current?.can().deleteRow()),
        canAddColumn: Boolean(current?.can().addColumnAfter()),
        canDeleteColumn: Boolean(current?.can().deleteColumn()),
        canToggleHeader: Boolean(current?.can().toggleHeaderRow()),
        canDeleteTable: Boolean(current?.can().deleteTable()),
        canUndo: Boolean(current?.can().undo()),
        canRedo: Boolean(current?.can().redo()),
      };
    },
  });

  useEffect(() => {
    if (!linkOpen) return;
    const timer = window.setTimeout(() => linkInput.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [linkOpen]);

  useEffect(() => {
    if (!imageOpen) return;
    const timer = window.setTimeout(() => imageInput.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [imageOpen]);

  const openLinkEditor = () => {
    if (!editor) return;
    setImageOpen(false);
    setLinkValue(String(editor.getAttributes("link").href || "https://"));
    setLinkError("");
    setLinkOpen(true);
  };

  const closeLinkEditor = (restoreFocus = true) => {
    setLinkOpen(false);
    setLinkError("");
    if (restoreFocus) window.setTimeout(() => linkButton.current?.focus(), 0);
  };

  const openImageEditor = () => {
    if (!editor) return;
    const attrs = editor.isActive("image") ? editor.getAttributes("image") : {};
    setLinkOpen(false);
    setImageUrl(typeof attrs.src === "string" ? attrs.src : "https://");
    setImageAlt(typeof attrs.alt === "string" ? attrs.alt : "");
    setImageCaption(typeof attrs.caption === "string" ? attrs.caption : "");
    setImageError("");
    setImageOpen(true);
  };

  const closeImageEditor = (restoreFocus = true) => {
    setImageOpen(false);
    setImageError("");
    if (restoreFocus) window.setTimeout(() => imageButton.current?.focus(), 0);
  };

  useEffect(() => {
    if (!linkOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || linkPopover.current?.contains(target) || linkButton.current?.contains(target)) return;
      closeLinkEditor(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeLinkEditor(true);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [linkOpen]);

  useEffect(() => {
    if (!imageOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || imagePopover.current?.contains(target) || imageButton.current?.contains(target)) return;
      closeImageEditor(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeImageEditor(true);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageOpen]);

  useEffect(() => {
    if (!editor) return;
    const openWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k" || !editor.isFocused) return;
      event.preventDefault();
      setLinkValue(String(editor.getAttributes("link").href || "https://"));
      setLinkError("");
      setLinkOpen(true);
    };
    window.addEventListener("keydown", openWithKeyboard);
    return () => window.removeEventListener("keydown", openWithKeyboard);
  }, [editor]);

  const saveLink = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const href = safeArticleLinkHref(linkValue);
    if (!href) {
      setLinkError("請輸入 https、站內路徑、Email 或電話連結");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  };

  const saveImage = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    if (imageUrl.length > ARTICLE_IMAGE_URL_MAX_LENGTH) {
      setImageError(`圖片網址不可超過 ${ARTICLE_IMAGE_URL_MAX_LENGTH} 個字元`);
      return;
    }
    const src = safeArticleImageSrc(imageUrl);
    if (!src) {
      setImageError("請輸入有效的 http 或 https 公開圖片網址，且不可包含帳號密碼");
      return;
    }
    const alt = imageAlt.trim();
    if (!alt) {
      setImageError("圖片替代文字為必填，請描述圖片內容");
      return;
    }
    if (alt.length > ARTICLE_IMAGE_ALT_MAX_LENGTH) {
      setImageError(`圖片替代文字不可超過 ${ARTICLE_IMAGE_ALT_MAX_LENGTH} 個字元`);
      return;
    }
    const caption = imageCaption.trim();
    if (caption.length > ARTICLE_IMAGE_CAPTION_MAX_LENGTH) {
      setImageError(`圖片說明不可超過 ${ARTICLE_IMAGE_CAPTION_MAX_LENGTH} 個字元`);
      return;
    }

    const attrs = {
      src,
      alt,
      caption: caption || null,
      title: null,
      width: null,
      height: null,
    };
    const command = editor.chain().focus();
    if (editor.isActive("image")) command.updateAttributes("image", attrs).run();
    else command.insertContent({ type: "image", attrs }).run();
    setImageOpen(false);
  };

  const blockValue = state?.block || "paragraph";

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="文章格式工具">
      <label className={styles.blockSelect} title="段落格式">
        <span className={styles.srOnly}>段落格式</span>
        <select
          value={blockValue}
          disabled={!editor}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "paragraph") editor?.chain().focus().setParagraph().run();
            if (value === "heading-2") editor?.chain().focus().setHeading({ level: 2 }).run();
            if (value === "heading-3") editor?.chain().focus().setHeading({ level: 3 }).run();
            if (value === "heading-4") editor?.chain().focus().setHeading({ level: 4 }).run();
          }}
        >
          <option value="paragraph">正文</option>
          <option value="heading-2">標題 2</option>
          <option value="heading-3">標題 3</option>
          <option value="heading-4">標題 4</option>
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      <span className={styles.separator} aria-hidden="true" />
      <div className={styles.group}>
        <ToolButton label="粗體" shortcut="Ctrl+B" toggle active={state?.bold} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton>
        <ToolButton label="斜體" shortcut="Ctrl+I" toggle active={state?.italic} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton>
        <ToolButton label="底線" shortcut="Ctrl+U" toggle active={state?.underline} disabled={!editor} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolButton>
        <ToolButton label="刪除線" toggle active={state?.strike} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolButton>
        <ToolButton label="行內程式碼" toggle active={state?.code} disabled={!editor} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={16} /></ToolButton>
      </div>

      <span className={styles.separator} aria-hidden="true" />
      <div className={styles.group}>
        <ToolButton label="項目清單" toggle active={state?.bulletList} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}><BulletListIcon size={16} /></ToolButton>
        <ToolButton label="編號清單" toggle active={state?.orderedList} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
        <ToolButton label="引用" toggle active={state?.blockquote} disabled={!editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolButton>
        <ToolButton label="程式碼區塊" toggle active={state?.codeBlock} disabled={!editor} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 size={16} /></ToolButton>
        <ToolButton label="分隔線" disabled={!editor} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
      </div>

      <span className={styles.separator} aria-hidden="true" />
      <div className={`${styles.group} ${styles.linkGroup}`}>
        <ToolButton buttonRef={linkButton} label="編輯連結" shortcut="Ctrl+K" toggle active={state?.link} expanded={linkOpen} controls="article-link-popover" disabled={!editor} onClick={openLinkEditor}><Link2 size={16} /></ToolButton>
        {state?.link && <ToolButton label="移除連結" disabled={!editor} onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}><Unlink size={16} /></ToolButton>}
        {linkOpen && (
          <form ref={linkPopover} id="article-link-popover" className={styles.linkPopover} role="dialog" aria-labelledby="article-link-title" onSubmit={saveLink}>
            <div>
              <label id="article-link-title" htmlFor="article-link-url">連結網址</label>
              <button type="button" aria-label="關閉連結設定" onClick={() => closeLinkEditor(true)}><X size={15} /></button>
            </div>
            <input
              ref={linkInput}
              id="article-link-url"
              value={linkValue}
              onChange={(event) => { setLinkValue(event.target.value); setLinkError(""); }}
              placeholder="https://example.com"
              autoComplete="off"
            />
            {linkError && <p role="alert">{linkError}</p>}
            <small>支援完整網址、/站內路徑、mailto: 與 tel:</small>
            <button type="submit" className={styles.applyLink}>套用連結</button>
          </form>
        )}
      </div>

      <span className={styles.separator} aria-hidden="true" />
      <div className={`${styles.group} ${styles.mediaGroup}`}>
        <ToolButton
          buttonRef={imageButton}
          label={state?.image ? "編輯內文圖片" : "插入內文圖片"}
          toggle
          active={state?.image}
          expanded={imageOpen}
          controls="article-image-popover"
          disabled={!editor}
          onClick={openImageEditor}
        ><ImagePlus size={16} /></ToolButton>
        {state?.image && <ToolButton label="移除內文圖片" disabled={!editor} onClick={() => editor?.chain().focus().deleteNode("image").run()}><Trash2 size={16} /></ToolButton>}
        {imageOpen && (
          <form ref={imagePopover} id="article-image-popover" className={styles.imagePopover} role="dialog" aria-labelledby="article-image-title" onSubmit={saveImage}>
            <div className={styles.popoverHeading}>
              <div><b id="article-image-title">{state?.image ? "編輯內文圖片" : "插入內文圖片"}</b><small>使用外部圖片網址</small></div>
              <button type="button" aria-label="關閉圖片設定" onClick={() => closeImageEditor(true)}><X size={15} /></button>
            </div>
            <label htmlFor="article-image-url">圖片網址</label>
            <input
              ref={imageInput}
              id="article-image-url"
              type="url"
              value={imageUrl}
              maxLength={ARTICLE_IMAGE_URL_MAX_LENGTH}
              onChange={(event) => { setImageUrl(event.target.value); setImageError(""); }}
              placeholder="https://cdn.example.com/article.webp"
              autoComplete="off"
            />
            <label htmlFor="article-image-alt">圖片替代文字 <span>必填</span></label>
            <input
              id="article-image-alt"
              value={imageAlt}
              maxLength={ARTICLE_IMAGE_ALT_MAX_LENGTH}
              onChange={(event) => { setImageAlt(event.target.value); setImageError(""); }}
              placeholder="例如：佛牌正面與外殼細節"
            />
            <label htmlFor="article-image-caption">圖片說明 <span>選填</span></label>
            <textarea
              id="article-image-caption"
              rows={2}
              value={imageCaption}
              maxLength={ARTICLE_IMAGE_CAPTION_MAX_LENGTH}
              onChange={(event) => { setImageCaption(event.target.value); setImageError(""); }}
              placeholder="顯示於圖片下方的來源或補充說明"
            />
            {imageError && <p role="alert">{imageError}</p>}
            <small className={styles.externalImageNote}>只會儲存公開圖片網址，不會把檔案上傳到 R2 或本站。請確認您有權使用該圖片。</small>
            <button type="submit" className={styles.applyImage}>{state?.image ? "更新圖片" : "插入圖片"}</button>
          </form>
        )}
      </div>

      <span className={styles.separator} aria-hidden="true" />
      <div className={`${styles.group} ${styles.tableGroup}`} aria-label="表格工具">
        {!state?.table ? (
          <ToolButton label="插入 2×2 表格" disabled={!editor} onClick={() => editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}><Table2 size={16} /></ToolButton>
        ) : <>
          <span className={styles.tableSize} title={`最多 ${ARTICLE_TABLE_MAX_ROWS} 列、${ARTICLE_TABLE_MAX_COLUMNS} 欄`}>{state.tableRows}×{state.tableColumns}</span>
          <ToolButton label="在下方新增一列" disabled={!state.canAddRow || state.tableRows >= ARTICLE_TABLE_MAX_ROWS} onClick={() => editor?.chain().focus().addRowAfter().run()}><span className={styles.compoundIcon}><Rows3 size={16} /><Plus size={9} /></span></ToolButton>
          <ToolButton label="刪除目前列" disabled={!state.canDeleteRow || state.tableRows <= 1} onClick={() => editor?.chain().focus().deleteRow().run()}><span className={styles.compoundIcon}><Rows3 size={16} /><Minus size={9} /></span></ToolButton>
          <ToolButton label="在右側新增一欄" disabled={!state.canAddColumn || state.tableColumns >= ARTICLE_TABLE_MAX_COLUMNS} onClick={() => editor?.chain().focus().addColumnAfter().run()}><span className={styles.compoundIcon}><Columns3 size={16} /><Plus size={9} /></span></ToolButton>
          <ToolButton label="刪除目前欄" disabled={!state.canDeleteColumn || state.tableColumns <= 1} onClick={() => editor?.chain().focus().deleteColumn().run()}><span className={styles.compoundIcon}><Columns3 size={16} /><Minus size={9} /></span></ToolButton>
          <ToolButton label="切換第一列為表頭" toggle active={state.tableHeader} disabled={!state.canToggleHeader || state.tableRowIndex !== 0} onClick={() => editor?.chain().focus().toggleHeaderRow().run()}><PanelTop size={16} /></ToolButton>
          <ToolButton label="刪除整個表格" disabled={!state.canDeleteTable} onClick={() => editor?.chain().focus().deleteTable().run()}><Trash2 size={16} /></ToolButton>
        </>}
      </div>

      <span className={styles.toolbarSpacer} />
      <div className={styles.group}>
        <ToolButton label="清除格式" disabled={!editor} onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}><Eraser size={16} /></ToolButton>
        <ToolButton label="復原" shortcut="Ctrl+Z" disabled={!state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></ToolButton>
        <ToolButton label="重做" shortcut="Ctrl+Shift+Z" disabled={!state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></ToolButton>
      </div>
    </div>
  );
}
