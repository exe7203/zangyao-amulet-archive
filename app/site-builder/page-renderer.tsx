import type { ReactNode } from "react";
import { Render } from "@puckeditor/core/rsc";
import { pageBuilderConfig } from "./puck-config";
import type { PageRenderMetadata } from "./types";
import { validatePageData } from "./validation";

export type PageRendererProps = PageRenderMetadata & {
  data: unknown;
  invalidFallback?: ReactNode;
};

export default function PageRenderer({
  data,
  products,
  articles,
  invalidFallback = null,
}: PageRendererProps) {
  const result = validatePageData(data);
  if (!result.ok) return invalidFallback;

  return <Render
    config={pageBuilderConfig}
    data={result.data}
    metadata={{ products, articles, preview: false } satisfies PageRenderMetadata}
  />;
}
