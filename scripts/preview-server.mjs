import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import worker from "../dist/server/index.js";

const port = Number(process.env.PORT || 3000);
const clientRoot = resolve("dist/client");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function staticResponse(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }

  const filePath = resolve(clientRoot, `.${pathname}`);
  if (filePath !== clientRoot && !filePath.startsWith(`${clientRoot}${sep}`)) return null;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const body = await readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
        "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  } catch {
    return null;
  }
}

async function toRequest(req) {
  const url = `http://${req.headers.host || `127.0.0.1:${port}`}${req.url || "/"}`;
  const init = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    init.body = Buffer.concat(chunks);
  }
  return new Request(url, init);
}

const server = createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const directAsset = new URL(request.url).pathname !== "/" ? await staticResponse(request.url) : null;
    const response = directAsset || await worker.fetch(
      request,
      { ASSETS: { fetch: async (assetRequest) => await staticResponse(assetRequest.url) || new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (req.method === "HEAD" || !response.body) return res.end();
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Local preview error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview ready at http://127.0.0.1:${port}`);
});
