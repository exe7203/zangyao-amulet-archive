import type { NextConfig } from "next";

const pagesBasePath = process.env.PAGES_BASE_PATH || "";
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const } : {}),
  trailingSlash: true,
  basePath: pagesBasePath,
};

export default nextConfig;
