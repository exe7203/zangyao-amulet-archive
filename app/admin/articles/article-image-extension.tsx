import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Image as ImageIcon } from "lucide-react";
import { SafePublicImage } from "../../product-artwork";
import { safeArticleImageAttributes } from "../../../lib/article-content-contract";
import styles from "../admin.module.css";

export function ArticleMediaPreview({ src, alt, label }: { src: string; alt: string; label: string }) {
  return <div className={styles.mediaPreview}>
    <SafePublicImage
      key={src}
      src={src}
      alt={alt}
      className={styles.mediaPreviewImage}
      fallback={(
        <div className={styles.mediaPreviewFallback} role="img" aria-label={`${label}尚未設定或無法載入`}>
          <ImageIcon size={24} aria-hidden="true" />
          <span>{label}尚未設定或無法載入</span>
        </div>
      )}
    />
  </div>;
}

function ArticleImageNodeView({ node, selected }: NodeViewProps) {
  const image = safeArticleImageAttributes(node.attrs);
  return (
    <NodeViewWrapper
      as="figure"
      className={`${styles.editorInlineImage} ${selected ? styles.editorInlineImageSelected : ""}`}
      data-drag-handle
    >
      {image ? <>
        <SafePublicImage
          src={image.src}
          alt={image.alt}
          className={styles.editorInlineImageMedia}
          fallback={<span className={styles.editorInlineImageFallback}>圖片暫時無法載入，請檢查外部網址。</span>}
        />
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </> : <span className={styles.editorInlineImageFallback}>圖片設定不完整，請使用工具列重新編輯。</span>}
    </NodeViewWrapper>
  );
}

export const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        rendered: false,
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageNodeView);
  },
});
