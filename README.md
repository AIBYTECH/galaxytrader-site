# GalaxyTrader parts catalogue

A fast, static catalogue website for **galaxytraderco.com**: industrial sewing machine spare parts for existing customers to find and reorder.

- **No prices, no logins, no checkout.** Customers add parts to a **reorder list** (saved on their phone) and send it on **WhatsApp** or by **email**.
- **One Excel workbook is the admin panel.** Edit `data/products.xlsx`, push to GitHub, and the site rebuilds itself.
- **Hosting costs $0:** pages on Cloudflare Pages, photos on Cloudflare R2, deploys through GitHub Actions.

## What's in the project

| File / folder | What it does |
| --- | --- |
| `data/products.xlsx` | The workbook: `products`, `machines`, `categories` sheets (with dropdowns) |
| `data/image_manifest.json` | Which SKUs have processed photos (committed; photos themselves are not) |
| `photos/` | Original product photos named by SKU, e.g. `GT-10021.jpg` (not in Git) |
| `make_sample_data.py` | Creates a sample workbook and placeholder photos to try the site |
| `process_images.py` | Converts photos to WebP (300 px and 900 px) and uploads them to R2 |
| `build.py` | Validates the workbook and generates the whole site into `dist/` |
| `make_qr.py` | One QR code per part, plus printable A4 label sheets |
| `templates/` | Jinja2 page templates (layout, home, product, category, list...) |
| `static/` | CSS, JavaScript, favicon, MiniSearch (search library) |
| `functions/api/click.js` | Cloudflare Pages Function that counts WhatsApp clicks per part |
| `schema.sql` | Table for the click log (Cloudflare D1 database) |
| `config.py` | Business details, URLs and colours in one place |
| `.github/workflows/deploy.yml` | Builds and deploys on every push |

## 1. Run it on your PC

Windows (PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # then edit .env: WhatsApp number etc.
python make_sample_data.py      # only the first time, to get sample data
python process_images.py
python build.py
python -m http.server 8000 -d dist
```

Linux / macOS:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python make_sample_data.py
python process_images.py
python build.py
python -m http.server 8000 -d dist
```

Open http://localhost:8000. (Clicking WhatsApp works locally; the click counter only runs on Cloudflare.)

## 2. Adding or changing products

1. Fill rows in `data/products.xlsx` (the **how to fill** sheet explains each column).
2. Put each photo in `photos/` named by SKU, e.g. `GT-10021.jpg` (800 px or larger on the short side, plain background).
3. Run:
   ```
   python process_images.py --upload    # converts new photos and uploads them to R2
   python build.py                      # checks the workbook and builds the site
   ```
4. If `build.py` reports **errors**, open `build/validation_report.csv`, fix those rows and run it again. **Warnings** (like a missing description) don't block the build.
5. Commit `data/products.xlsx` and `data/image_manifest.json`, then push to **staging** to check the preview, then merge into **main** to go live.

Rules the build checks: unique SKUs in the format `GT-10021`, categories and machines that exist on their sheets, specs written as `Key: Value; Key: Value`, whole-number MOQ, Yes/No stock, and a processed photo for every part. Rows with status `draft` are skipped; `discontinued` parts stay online with an "Ask for an alternative" button.

**URLs never change.** Product pages live at `/p/<sku>/` (e.g. `/p/gt-10021/`), so renaming a part never breaks old links or printed QR codes.

## 3. QR codes for packaging and invoices

```
python build.py
python make_qr.py                         # all parts
python make_qr.py --sku GT-10021 GT-10115 # only some parts
```

Output in `build/qr/`: a PNG and SVG per part, and `labels-A4.pdf` (24 labels per page: QR, part number, name).

## 4. One-time Cloudflare and GitHub setup

1. **GitHub:** create a private repo `galaxytrader-site` and push this folder. Create a `staging` branch too.
2. **R2 (photos):** Cloudflare dashboard → R2 → create bucket `galaxytrader-img`, then **Settings → Custom domains → `img.galaxytraderco.com`**. Create a second, private bucket `galaxytrader-originals` for photo backups. Create an **R2 API token** (Object Read & Write, these two buckets only) and put its keys in your `.env`.
3. **Pages project:** Workers & Pages → Create → Pages → **Direct upload**, name it `galaxytrader`. Under **Custom domains**, add `galaxytraderco.com` and `www.galaxytraderco.com`.
4. **API token for GitHub:** My Profile → API Tokens → Create token → **Edit Cloudflare Workers** template (or a custom token with *Cloudflare Pages: Edit*). In GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `WHATSAPP_NUMBER`, `WHATSAPP_DISPLAY`, `IMG_BASE_URL` = `https://img.galaxytraderco.com`
5. **Click log (optional, free):** Workers & Pages → D1 → create database `galaxytrader-logs`, then run
   `npx wrangler d1 execute galaxytrader-logs --remote --file=schema.sql`.
   In the Pages project → Settings → Bindings, add a **D1 binding** named `LOG_DB`.
6. **Analytics (optional, free):** turn on **Web Analytics** for the Pages project.

Push to `main` and the Action builds and deploys the site.

## 5. Monthly click report

In the Cloudflare dashboard → D1 → `galaxytrader-logs` → Console:

```sql
SELECT sku, COUNT(*) AS clicks FROM clicks
WHERE sku <> '' AND ts >= datetime('now', '-30 days')
GROUP BY sku ORDER BY clicks DESC LIMIT 20;
```

## Limits to keep in mind

- Cloudflare Pages free plan: **20,000 files** per site. With photos on R2, 3,500 products use about 4,000 files; `build.py` stops if the count goes over 19,000.
- R2 free tier: 10 GB storage. 3,500 parts × 2 WebP sizes is about 0.5 GB.
- The search index is one JSON file loaded only when someone uses search.

## Still to do before launch

- [ ] Real WhatsApp number in `.env` and in the GitHub variables
- [ ] Final logo (replace `templates/_logo.svg` and `static/img/favicon.svg`)
- [ ] About-us text in `templates/about.html`
- [ ] Real products and photos in place of the samples
- [ ] Phase 9 of the plan: AI parts assistant and order tracking (`build/catalog.jsonl` is already generated for it)
