"use client";

import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import ArticleEditorToolbar from "../article-editor-toolbar";
import type { Draft } from "./types";
import editorStyles from "../admin.module.css";

export function ArticleDocument({
  draft,
  editor,
  dirty,
  wordCount,
  readingMinutes,
  onTitleChange,
  onExcerptChange,
}: {
  draft: Draft;
  editor: Editor | null;
  dirty: boolean;
  wordCount: number;
  readingMinutes: number;
  onTitleChange: (title: string) => void;
  onExcerptChange: (excerpt: string) => void;
}) {
  return (
    <article className={editorStyles.documentCanvas} aria-label="文章文件">
      <div className={editorStyles.documentHeading}>
        <label>
          <span className={editorStyles.srOnly}>文章標題</span>
          <textarea
            className={editorStyles.titleInput}
            rows={1}
            value={draft.title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="文章標題"
          />
        </label>
        <label>
          <span className={editorStyles.srOnly}>文章摘要</span>
          <textarea
            className={editorStyles.excerptInput}
            rows={2}
            value={draft.excerpt}
            onChange={(event) => onExcerptChange(event.target.value)}
            placeholder="用一小段話說明這篇文章的重點"
          />
        </label>
      </div>
      <ArticleEditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <footer className={editorStyles.editorStats}>
        <span>
          {wordCount} 字 · 約 {readingMinutes} 分鐘閱讀
        </span>
        <span>{dirty ? "尚未儲存" : draft.id ? `第 ${draft.version} 版` : "新草稿"}</span>
      </footer>
    </article>
  );
}
