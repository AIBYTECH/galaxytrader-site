/**
 * Cloudflare Pages Function: POST /api/click
 *
 * Counts WhatsApp clicks per part so you can see which parts customers ask
 * about most. Stores only the SKU, the button that was clicked and the time
 * (no phone numbers, no IP addresses).
 *
 * Needs a D1 database bound to the Pages project as LOG_DB
 * (Cloudflare dashboard -> Workers & Pages -> galaxytrader -> Settings -> Bindings).
 * Create the table once with:  npx wrangler d1 execute galaxytrader-logs --remote --file=schema.sql
 * If LOG_DB isn't bound yet, the function does nothing and still returns 204.
 */
const SKU_RE = /^[A-Z0-9-]{0,20}$/;
const SRC_RE = /^[a-z0-9-]{1,20}$/;

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const sku = String(data.sku || "").toUpperCase();
    const src = String(data.src || "unknown").toLowerCase();
    if (!SKU_RE.test(sku) || !SRC_RE.test(src)) {
      return new Response(null, { status: 400 });
    }
    if (env.LOG_DB) {
      await env.LOG_DB.prepare("INSERT INTO clicks (ts, sku, src) VALUES (?1, ?2, ?3)")
        .bind(new Date().toISOString(), sku, src)
        .run();
    }
  } catch (err) {
    // Logging must never break the site; ignore bad requests quietly.
  }
  return new Response(null, { status: 204 });
}
