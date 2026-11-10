/**
 * Local preview server that behaves like Cloudflare (Workers static assets):
 *   - serves dist/ with clean URLs (/p/gt-10021/ -> p/gt-10021/index.html);
 *   - applies the headers from dist/_headers (so the strict CSP is tested);
 *   - answers unknown URLs with dist/404.html and status 404;
 *   - gzips text files like Cloudflare does (so Lighthouse sees real sizes);
 *   - sends /api/* to worker/index.js (like "run_worker_first" in
 *     wrangler.jsonc), with a fake D1 database that keeps click rows in
 *     memory (GET /__clicks lists them; tests only).
 *
 *   node scripts/serve.mjs            # http://localhost:4321
 *   PORT=8080 node scripts/serve.mjs
 *
 * For a full Cloudflare simulation you can also use `npx wrangler dev`.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = resolve("dist");
const PORT = Number(process.env.PORT || 4321);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain",
};

/** Parse _headers into [{ pattern: RegExp, headers: [[name, value]] }]. */
function loadHeaders() {
  const rules = [];
  const file = join(DIST, "_headers");
  if (!existsSync(file)) return rules;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      const glob = line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      rules.push({ pattern: new RegExp(`^${glob}$`), headers: [] });
    } else {
      const i = line.indexOf(":");
      rules.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

// Fake D1: just enough of prepare().bind().run() for worker/index.js.
const clicks = [];
const LOG_DB = {
  prepare: () => ({ bind: (ts, sku, src, host) => ({ run: async () => clicks.push({ ts, sku, src, host }) }) }),
};
const worker = (await import(pathToFileURL(resolve("worker/index.js")).href)).default;
// The worker hands non-API requests back to the static files via env.ASSETS;
// here that means "fall through to the file server below".
const FALL_THROUGH = Symbol("assets");
const ASSETS = { fetch: async () => FALL_THROUGH };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    const body = await new Promise((ok) => {
      let s = "";
      req.on("data", (c) => (s += c)).on("end", () => ok(s));
    });
    const request = new Request(url, {
      method: req.method,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      headers: { "content-type": req.headers["content-type"] ?? "application/json" },
    });
    const response = await worker.fetch(request, { LOG_DB, ASSETS });
    if (response !== FALL_THROUGH) {
      res.writeHead(response.status).end();
      return;
    }
  }
  if (url.pathname === "/__clicks") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(clicks));
    return;
  }

  let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!path.startsWith(DIST)) path = DIST; // no ../ tricks
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  let status = 200;
  if (!existsSync(path)) {
    path = join(DIST, "404.html");
    status = 404;
  }

  const headers = { "content-type": TYPES[extname(path)] || "application/octet-stream" };
  for (const rule of loadHeaders()) {
    if (rule.pattern.test(url.pathname)) for (const [k, v] of rule.headers) headers[k] = v;
  }
  let body = readFileSync(path);
  if (/text|javascript|json|svg|xml/.test(headers["content-type"]) && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
    body = gzipSync(body);
    headers["content-encoding"] = "gzip";
    headers["vary"] = "Accept-Encoding";
  }
  res.writeHead(status, headers).end(body);
}).listen(PORT, () => console.log(`Serving dist/ on http://localhost:${PORT}`));
