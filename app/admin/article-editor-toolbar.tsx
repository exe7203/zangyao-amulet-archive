"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code2,
  Eraser,
  Italic,
  Link2,
  List as BulletListIcon,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { safeArticleLinkHref } from "../../lib/article-content-contract";
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

export default function ArticleEditorToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const linkPopover = useRef<HTMLFormElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
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
      canUndo: Boolean(current?.can().undo()),
      canRedo: Boolean(current?.can().redo()),
    }),
  });

  useEffect(() => {
    if (!linkOpen) return;
    const timer = window.setTimeout(() => linkInput.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [linkOpen]);

  const openLinkEditor = () => {
    if (!editor) return;
    setLinkValue(String(editor.getAttributes("link").href || "https://"));
    setLinkError("");
    setLinkOpen(true);
  };

  const closeLinkEditor = (restoreFocus = true) => {
    setLinkOpen(false);
    setLinkError("");
    if (restoreFocus) window.setTimeout(() => linkButton.current?.focus(), 0);
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

      <span className={styles.toolbarSpacer} />
      <div className={styles.group}>
        <ToolButton label="清除格式" disabled={!editor} onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}><Eraser size={16} /></ToolButton>
        <ToolButton label="復原" shortcut="Ctrl+Z" disabled={!state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></ToolButton>
        <ToolButton label="重做" shortcut="Ctrl+Shift+Z" disabled={!state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></ToolButton>
      </div>
    </div>
  );
}
