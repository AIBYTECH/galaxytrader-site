/**
 * Cloudflare Worker for galaxytraderco.com (Workers static assets).
 *
 * The website itself is plain static files in dist/ (built by Astro). Cloudflare
 * serves them straight from its static-assets store, applying dist/_headers
 * (security headers + caching) and showing dist/404.html for unknown pages.
 *
 * This script only runs for /api/* (see "run_worker_first" in wrangler.jsonc):
 *
 *   POST /api/click  counts WhatsApp clicks per part, so you can see which parts
 *                    customers ask about most. Stores only the SKU, the button
 *                    that was clicked, the time and the site's host name (no
 *                    phone numbers, no IPs). Live and preview builds share one
 *                    database, so the host tells real customer clicks
 *                    (galaxytraderco.com) apart from staging/preview tests.
 *
 * Click logging needs a D1 database bound as LOG_DB (see wrangler.jsonc and
 * README section 4). Until it is bound, the click is ignored and the visitor
 * still gets 204, so the site never breaks because of logging.
 */
const SKU_RE = /^[A-Z0-9-]{0,20}$/;
const SRC_RE = /^[a-z0-9-]{1,20}$/;

/** POST /api/click with JSON { sku, src } -> one row in the "clicks" table. */
export async function logClick(request, env) {
  try {
    const data = await request.json();
    const sku = String(data.sku || "").toUpperCase();
    const src = String(data.src || "unknown").toLowerCase();
    if (!SKU_RE.test(sku) || !SRC_RE.test(src)) {
      return new Response(null, { status: 400 });
    }
    // Which address the visitor used, e.g. "galaxytraderco.com" or
    // "staging-galaxytrader.<account>.workers.dev". Taken from the request
    // URL, so the browser can't put anything else here.
    const host = new URL(request.url).hostname.toLowerCase();
    if (env.LOG_DB) {
      await env.LOG_DB.prepare("INSERT INTO clicks (ts, sku, src, host) VALUES (?1, ?2, ?3, ?4)")
        .bind(new Date().toISOString(), sku, src, host)
        .run();
    }
  } catch {
    // Logging must never break the site; ignore bad requests quietly.
  }
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/click" && request.method === "POST") {
      return logClick(request, env);
    }
    // Anything else (other /api/ paths): let the static files answer,
    // which gives the normal 404 page.
    return env.ASSETS.fetch(request);
  },
};
