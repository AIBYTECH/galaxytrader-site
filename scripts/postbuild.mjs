/**
 * Runs after `astro build` (see "build" in package.json). Three jobs:
 *
 * 1. CSP hashes. Astro puts a few tiny scripts inline (the island loader
 *    and the client:idle / client:visible / client:load helpers) plus one
 *    <style> rule. A strict CSP blocks inline code unless it lists the
 *    code's sha256 hash, so we hash every inline block in dist/**.html and
 *    add the hashes to the Content-Security-Policy in dist/_headers.
 *    Motion's server render also writes a few style="" attributes with the
 *    end state of an animation (e.g. "opacity:1;transform:none;"). Those
 *    exact values are allowed with 'unsafe-hashes' + their hash, which is
 *    still far stricter than 'unsafe-inline'.
 *    JSON-LD (<script type="application/ld+json">) is data, not code, and
 *    needs no hash.
 *
 * 2. File count. Cloudflare Workers static assets (free plan) allow 20,000 files;
 *    we stop at the limit in site.json (19,000) to keep a safety margin.
 *
 * 3. JavaScript budget (gzipped) per page type: home 120 KB, product and
 *    category pages 60 KB. We follow every script a page loads, including
 *    Motion's lazily loaded features, but not the search library that
 *    downloads only when someone types in the search box.
 *
 * Any failure exits with code 1, so a broken build never gets deployed.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, dirname, resolve, posix } from "node:path";

const DIST = resolve("dist");
const site = JSON.parse(readFileSync("src/data/site.json", "utf8"));
const BUDGETS = [
  // [label, page path inside dist/, KB gzipped]
  ["home", "index.html", 120],
  ["category", firstPage("c"), 60],
  ["machine", firstPage("m"), 60],
  ["product", firstPage("p"), 60],
];

let failed = false;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed = true;
};

/** Every file under a folder (recursive). */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function firstPage(section) {
  const dir = join(DIST, section);
  if (!existsSync(dir)) return null;
  const first = readdirSync(dir).sort()[0];
  return first ? `${section}/${first}/index.html` : null;
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));

// ---------------------------------------------------------------------------
// 1. Hash inline scripts and styles, write them into _headers
// ---------------------------------------------------------------------------
const sha = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const scriptHashes = new Set();
const styleHashes = new Set();
const styleAttrHashes = new Set();

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(attrs) || /type="application\/(ld\+)?json"/.test(attrs) || !body.trim()) continue;
    scriptHashes.add(sha(body));
  }
  for (const [, body] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styleHashes.add(sha(body));
  for (const [, value] of html.matchAll(/\sstyle="([^"]*)"/g)) styleAttrHashes.add(sha(value.replaceAll("&quot;", '"')));
}

const headersPath = join(DIST, "_headers");
if (!existsSync(headersPath)) {
  fail("dist/_headers is missing: run `python build.py --emit-json` before `npm run build`.");
} else {
  const headers = readFileSync(headersPath, "utf8")
    .replace(/script-src 'self'/, `script-src 'self' ${[...scriptHashes].join(" ")}`)
    .replace(
      /style-src 'self'/,
      `style-src 'self' ${[...styleHashes].join(" ")}` +
        (styleAttrHashes.size ? ` 'unsafe-hashes' ${[...styleAttrHashes].join(" ")}` : ""),
    );
  writeFileSync(headersPath, headers);
  console.log(
    `CSP: added ${scriptHashes.size} script, ${styleHashes.size} style and ${styleAttrHashes.size} style-attribute hash(es) to dist/_headers`,
  );
  if (scriptHashes.size > 8) fail(`${scriptHashes.size} different inline scripts; expected only Astro's few loaders. Move page code into <script> files.`);
}
if (styleAttrHashes.size > 10) fail(`${styleAttrHashes.size} different style="" values; use classes instead of inline styles.`);

// ---------------------------------------------------------------------------
// 2. File count
// ---------------------------------------------------------------------------
console.log(`Files: ${files.length} in dist/ (limit ${site.maxSiteFiles})`);
if (files.length > site.maxSiteFiles) {
  fail(`Too many files (${files.length}). Cloudflare allows 20,000; serve images from R2 (set IMG_BASE_URL).`);
}

// ---------------------------------------------------------------------------
// 3. JavaScript budget per page type
// ---------------------------------------------------------------------------
const gz = (file) => gzipSync(readFileSync(file)).length;

/**
 * Collect a JS file and everything it imports. Static imports and Motion's
 * lazy features always load; anything the search module imports dynamically
 * (the MiniSearch library) loads only on first search, so it goes in onDemand.
 */
function collect(file, seen, onDemand, lazy = false) {
  const bucket = lazy ? onDemand : seen;
  if (seen.has(file) || bucket.has(file)) return;
  bucket.add(file);
  const code = readFileSync(file, "utf8");
  const isSearch = code.includes("/data/search-index.json");
  for (const [, spec] of code.matchAll(/from\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    collect(resolve(dirname(file), spec), seen, onDemand, lazy);
  }
  for (const [, spec] of code.matchAll(/import\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g)) {
    collect(resolve(dirname(file), spec), seen, onDemand, lazy || isSearch);
  }
}

console.log("JavaScript per page (gzipped):");
for (const [label, page, budgetKb] of BUDGETS) {
  if (!page) continue;
  const html = readFileSync(join(DIST, page), "utf8");
  const entries = new Set();
  for (const [, url] of html.matchAll(/(?:src|component-url|renderer-url)="(\/_astro\/[^"]+\.js)"/g)) {
    entries.add(join(DIST, url));
  }
  const seen = new Set();
  const onDemand = new Set();
  entries.forEach((e) => collect(e, seen, onDemand));
  // Inline loader scripts count too.
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].reduce((n, [, b]) => n + gzipSync(b).length, 0);
  const total = [...seen].reduce((n, f) => n + gz(f), 0) + inline;
  const later = [...onDemand].reduce((n, f) => n + gz(f), 0);
  const kb = (total / 1024).toFixed(1);
  const line = `  ${label.padEnd(9)} ${kb.padStart(6)} KB  (budget ${budgetKb} KB${later ? `, +${(later / 1024).toFixed(1)} KB search on first use` : ""})  ${posix.normalize(relative(DIST, join(DIST, page)))}`;
  if (total / 1024 > budgetKb) fail(line);
  else console.log(line);
}

if (failed) {
  console.error("Post-build checks failed.");
  process.exit(1);
}
console.log("Post-build checks passed.");
