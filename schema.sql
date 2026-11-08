-- D1 database "galaxytrader-logs": click and search logs for monthly reports.
CREATE TABLE IF NOT EXISTS clicks (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  ts  TEXT NOT NULL,          -- ISO time of the click
  sku TEXT NOT NULL,          -- part number ('' for general WhatsApp buttons)
  src TEXT NOT NULL           -- which button: product, header, hero, contact ...
);
CREATE INDEX IF NOT EXISTS idx_clicks_sku ON clicks (sku);

-- Example monthly report: top 20 parts by WhatsApp clicks in the last 30 days
-- SELECT sku, COUNT(*) AS clicks FROM clicks
--  WHERE sku <> '' AND ts >= datetime('now', '-30 days')
--  GROUP BY sku ORDER BY clicks DESC LIMIT 20;
