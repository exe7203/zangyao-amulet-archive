/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleAdminAuthApi } from "./admin-auth-api";
import { handleAdminSystemApi, handlePublicHealthApi } from "./admin-system-api";
import { handleContentApi } from "./content-api";
import { handleSiteApi } from "./site-api";
import { expireStaleReservations, handleStoreApi } from "./store-api";
import { ensureDatabase } from "./database";
import { handleSeoMetadata } from "./seo-metadata";
import { withSecurityHeaders } from "./security-headers";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  ADMIN_EMAIL_ALLOWLIST?: string;
  ADMIN_LOCAL_AUTH_REQUIRED?: string;
  ADMIN_LOCAL_SESSION_SECRET?: string;
  ADMIN_LOCAL_ACCOUNTS?: string;
  STORE_ORDERS_ENABLED?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // vinext currently applies trailing-slash redirects before resolving
    // metadata routes. Serve the two standard crawler endpoints explicitly so
    // /robots.txt and /sitemap.xml remain stable in the Worker runtime.
    // vinext's prerender discovery requests do not always provide a Worker
    // bindings object. SEO metadata is deliberately fail-closed in that case.
    const seoMetadataResponse = handleSeoMetadata(request, env?.NEXT_PUBLIC_SITE_URL);
    if (seoMetadataResponse) return seoMetadataResponse;

    const adminAuthResponse = await handleAdminAuthApi(request, env);
    if (adminAuthResponse) return adminAuthResponse;

    const publicHealthResponse = await handlePublicHealthApi(request);
    if (publicHealthResponse) return publicHealthResponse;

    const adminSystemResponse = await handleAdminSystemApi(request, env);
    if (adminSystemResponse) return adminSystemResponse;

    const contentResponse = await handleContentApi(request, env);
    if (contentResponse) return contentResponse;

    const siteResponse = await handleSiteApi(request, env);
    if (siteResponse) return siteResponse;

    const storeResponse = await handleStoreApi(request, env);
    if (storeResponse) return storeResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(request, response);
  },
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    const db = env.DB;
    if (!db) return;
    ctx.waitUntil(ensureDatabase(db).then(() => expireStaleReservations(db)));
  },
};

export default worker;
