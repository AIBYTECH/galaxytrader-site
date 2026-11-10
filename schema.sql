-- D1 database "galaxytrader-logs": WhatsApp click log for monthly reports.
-- New database:  npx wrangler d1 execute galaxytrader-logs --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS clicks (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   TEXT NOT NULL,          -- ISO time of the click
  sku  TEXT NOT NULL,          -- part number ('' for general WhatsApp buttons)
  src  TEXT NOT NULL,          -- which button: product, header, hero, contact ...
  host TEXT NOT NULL DEFAULT '' -- site address: galaxytraderco.com, or a staging/preview workers.dev address
);
CREATE INDEX IF NOT EXISTS idx_clicks_sku ON clicks (sku);

-- A database created before the "host" column existed needs this once:
--   npx wrangler d1 execute galaxytrader-logs --remote --command "ALTER TABLE clicks ADD COLUMN host TEXT NOT NULL DEFAULT ''"

-- Example monthly report: top 20 parts by WhatsApp clicks in the last 30 days,
-- counting only the live site (not staging or preview addresses):
-- SELECT sku, COUNT(*) AS clicks FROM clicks
--  WHERE sku <> '' AND ts >= datetime('now', '-30 days')
--    AND (host IN ('galaxytraderco.com', 'www.galaxytraderco.com')
--         OR host LIKE 'galaxytrader.%.workers.dev')
--  GROUP BY sku ORDER BY clicks DESC LIMIT 20;
