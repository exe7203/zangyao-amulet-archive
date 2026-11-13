import { Puck, type Overrides } from "@puckeditor/core";
import { pageBuilderConfig } from "../../site-builder/puck-config";
import type { PageData, PageRenderMetadata } from "../../site-builder/types";
import styles from "./site-editor.module.css";

export const puckOverrides = {
  headerActions: () => <></>,
} satisfies Partial<Overrides<typeof pageBuilderConfig>>;

export default function PageCanvas({
  editorKey,
  data,
  metadata,
  title,
  previewHref,
  onChange,
  onPublish,
}: {
  editorKey: number;
  data: PageData;
  metadata: PageRenderMetadata;
  title: string;
  previewHref: string;
  onChange: (data: PageData) => void;
  onPublish: (data: PageData) => void;
}) {
  return (
    <div className={styles.builderFrame}>
      <Puck
        key={editorKey}
        config={pageBuilderConfig}
        data={data}
        metadata={metadata}
        overrides={puckOverrides}
        headerTitle={title || "新網站頁面"}
        headerPath={previewHref}
        height="max(640px, calc(100vh - 136px))"
        viewports={[
          { width: 1440, height: "auto", label: "桌面 1440" },
          { width: 1024, height: "auto", label: "小桌面 1024" },
          { width: 768, height: "auto", label: "平板 768" },
          { width: 375, height: "auto", label: "手機 375" },
          { width: 320, height: "auto", label: "窄手機 320" },
        ]}
        onChange={onChange}
        onPublish={onPublish}
      />
    </div>
  );
}
