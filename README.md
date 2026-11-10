# GalaxyTrader parts catalogue

A fast, static catalogue website for **galaxytraderco.com**: industrial sewing machine spare parts (plus textile, electronic and hardware parts) for existing customers to find and reorder.

- **No prices, no logins, no checkout.** Customers add parts to a **reorder list** (saved on their phone) and send it on **WhatsApp** or by **email**.
- **One Excel workbook is the admin panel.** Edit `data/products.xlsx`, push to GitHub, and the site rebuilds itself.
- **Hosting costs $0:** pages on Cloudflare Pages, photos on Cloudflare R2, deploys through GitHub Actions.

## How it is built

```
data/products.xlsx ──► python build.py --emit-json ──► src/data/*.json ──► npm run build ──► dist/ ──► Cloudflare Pages
   (the admin panel)     validates every row,           public/data/...     Astro makes static
                         stops on errors                                    HTML for every page
```

- **Python** (`build.py`) checks the workbook and writes JSON. Errors stop the build; the full list is in `build/validation_report.csv`.
- **Astro** turns the JSON into plain HTML pages. Everything readable is in the HTML, so pages work without JavaScript and Google can read them.
- **Islands**: only the interactive parts run JavaScript (search box, machine picker, filters, reorder list, recently viewed, add-to-list buttons, toast). They are written as React components and run on **Preact's React-compatible layer** (10 KB instead of React's 45 KB), so product and category pages stay under 60 KB of JavaScript.
- **Tailwind CSS** for styling, **Motion** for small animations, **MiniSearch** for search.
- `npm run build` does both steps: npm runs the `prebuild` script (`python build.py --emit-json`) first, then Astro. So the same one command works on your PC, in GitHub Actions and in Cloudflare's own build.
- `npm run build` also checks: the JavaScript budget per page, the file count (< 19,000), and adds hashes for Astro's tiny inline loader to the strict Content-Security-Policy in `dist/_headers`.

## What's in the project

| File / folder | What it does |
| --- | --- |
| `data/products.xlsx` | The workbook: `products`, `machines`, `categories` sheets (with dropdowns) |
| `data/image_manifest.json` | Which SKUs have processed photos (committed; photos themselves are not) |
| `photos/` | Original product photos named by SKU, e.g. `GT-10021.jpg` (not in Git) |
| `build.py` | Validates the workbook; with `--emit-json` writes the data for the website |
| `process_images.py` | Converts photos to WebP (300 px and 900 px) and uploads them to R2 |
| `make_qr.py` | One QR code per part, plus printable A4 label sheets |
| `make_sample_data.py` | Creates a sample workbook and placeholder photos to try the site |
| `config.py` | Business details (WhatsApp, email, address, hours) and build settings |
| `src/pages/` | One Astro file per page type (home, product, category, machine, search, list...) |
| `src/layouts/Base.astro` | Header, menu, footer and `<head>` shared by every page |
| `src/components/islands/` | Interactive parts (React-style components) |
| `src/components/ui/` | Animated components adapted from Magic UI (see `CREDITS.md`) |
| `src/styles/global.css` | Colours, fonts and shared styles (Tailwind `@theme`) |
| `src/scripts/site.ts` | Small plain-JS helpers: scroll reveal, card spotlight, WhatsApp click counter |
| `src/lib/` | Data loading, reorder-list storage, search, animation presets |
| `public/` | Files copied as-is: fonts, favicon (+ generated data, sitemap, `_headers`) |
| `functions/api/click.js` | Cloudflare Pages Function that counts WhatsApp clicks per part |
| `schema.sql` | Table for the click log (Cloudflare D1 database) |
| `scripts/postbuild.mjs` | CSP hashes, file count and JavaScript budget checks |
| `scripts/serve.mjs` | Local preview that behaves like Cloudflare Pages |
| `tests/` | Playwright tests for every feature |
| `.github/workflows/deploy.yml` | Builds and deploys on every push |
| `CREDITS.md` | Every copied component with its source and licence |

## 1. Run it on your PC

You need **Python 3.12+** and **Node.js 22.23+** (https://nodejs.org, LTS).

### Windows (PowerShell)

```powershell
# one time
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm ci
Copy-Item .env.example .env       # then edit .env: WhatsApp number etc.
python make_sample_data.py        # only if you want the sample data

# every time you change data or code
python process_images.py          # new photos -> WebP
npm run build                     # check the workbook, write the JSON, build the site into dist/
npm run preview                   # open http://localhost:4321
```

If PowerShell refuses to run `Activate.ps1`, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Linux / macOS

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
npm ci
cp .env.example .env
python make_sample_data.py
python process_images.py
npm run build                     # runs python build.py --emit-json first
npm run preview                   # http://localhost:4321
```

**While editing pages or styles**, use `npm run dev` instead (http://localhost:4321, reloads on save). Run `python build.py --emit-json` first so the data exists.

`npm run preview` applies the real security headers from `_headers` and fakes the click counter, so it is the closest thing to the live site.

### Tests

```bash
npx playwright install chromium   # one time
npm run test:e2e                  # every feature, on a phone (390 px) and a desktop (1366 px)
```

## 2. Adding or changing products

1. Fill rows in `data/products.xlsx` (the **how to fill** sheet explains each column).
2. Put each photo in `photos/` named by SKU, e.g. `GT-10021.jpg` (800 px or larger on the short side, plain background).
3. Run:
   ```
   python process_images.py --upload    # converts new photos and uploads them to R2
   npm run build                        # checks the workbook, then builds the site
   ```
4. If `build.py` reports **errors**, open `build/validation_report.csv`, fix those rows and run it again. **Warnings** (like a missing description) don't block the build.
5. Commit `data/products.xlsx` and `data/image_manifest.json`, push to **staging** to check the preview, then merge into **main** to go live.

Rules the build checks: unique SKUs in the format `GT-10021`, categories and machines that exist on their sheets, specs written as `Key: Value; Key: Value`, whole-number MOQ, Yes/No stock, and a processed photo for every part. Rows with status `draft` are skipped; `discontinued` parts stay online with an "Ask for an alternative" button.

Local names and other spellings go in the **aliases** columns (e.g. `kanda` for a rotary hook): search finds them. Search also ignores dashes, spaces and capitals in part numbers and reads a letter O as zero, so `gt10115`, `GT-1O115` and `ddl8700` all work.

**URLs never change.** Product pages live at `/p/<sku>/` (e.g. `/p/gt-10021/`), so renaming a part never breaks old links or printed QR codes. Categories: `/c/<category_id>/` (48 parts per page, then `/page/2/`...). Machines: `/m/<machine_id>/`.

## 3. QR codes for packaging and invoices

```
python build.py --emit-json               # writes build/catalog.jsonl
python make_qr.py                         # all parts
python make_qr.py --sku GT-10021 GT-10115 # only some parts
```

Output in `build/qr/`: a PNG and SVG per part, and `labels-A4.pdf` (24 labels per page: QR, part number, name).

## 4. Deploy (one-time Cloudflare and GitHub setup)

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

After that, every push builds and deploys automatically (`.github/workflows/deploy.yml`):

| Push to | Result |
| --- | --- |
| `staging` | preview at `staging.galaxytrader.pages.dev` |
| `main` | live site `galaxytraderco.com` |

The workflow runs `npm ci && npm run build` (which runs `python build.py --emit-json` first), then uploads `dist/` and `functions/` with wrangler. If validation, the JavaScript budget or the file count fails, nothing is deployed.

**Photos without R2:** when `IMG_BASE_URL` is empty, the build puts the photos into the site itself (from `build/img/`, else from `photos/`, else the drawn sample placeholders). A fresh clone therefore shows the sample photos with no extra steps.

**If you connect the repo in Cloudflare's dashboard instead** (Git integration rather than this workflow): build command `npm run build`, output directory `dist`. Cloudflare installs `requirements.txt` automatically, so the Python step runs there too.

**Never commit `.env`.** Secrets live only in `.env` on your PC and in GitHub's secrets.

## 5. Monthly click report

In the Cloudflare dashboard → D1 → `galaxytrader-logs` → Console:

```sql
SELECT sku, COUNT(*) AS clicks FROM clicks
WHERE sku <> '' AND ts >= datetime('now', '-30 days')
GROUP BY sku ORDER BY clicks DESC LIMIT 20;
```

## Design rules (keep them when editing)

- **Colours (60-30-10):** background `#F5F5F4` + white cards; charcoal `#1A1A1A` for header, footer, headings, text; orange `#FF6F00` only for button fills and highlights. Orange *text* is `#C2410C`; text on orange buttons is charcoal. Tokens are in `src/styles/global.css` (`@theme`).
- **Fonts:** Barlow Condensed 700/800 (self-hosted, `public/fonts/`) for uppercase headings, the system font for text, monospace for part numbers.
- **Animation:** 400 ms or less, only `opacity`/`transform` (blur and other filters can't run on the GPU and slow phones down), nothing with "reduce motion" switched on, no video, no scroll-jacking, no 3D. The product page stays calm.
- **Touch targets** at least 44 px; 16 px side margins on phones.
- **No inline `<script>` or `style=""`** in your own code: the CSP in `_headers` blocks them. Put code in `src/scripts/` or an island, and styles in classes.
- **New UI components:** only from MIT-licensed sources, copied into `src/components/ui/` and listed in `CREDITS.md`.

## Limits to keep in mind

- Cloudflare Pages free plan: **20,000 files** per site. With photos on R2, 3,500 products need about 4,000 files; the build stops at 19,000.
- R2 free tier: 10 GB storage. 3,500 parts × 2 WebP sizes is about 0.5 GB.
- JavaScript budget (gzipped): product, category and machine pages 60 KB, home 120 KB. Currently about 57 KB; the search library (5.5 KB) loads only when someone searches.

## Still to do before launch

- [x] Real WhatsApp number in `.env` (`923348118152`); also add `WHATSAPP_NUMBER` and `WHATSAPP_DISPLAY` as GitHub repository variables
- [ ] Final logo: replace `templates/_logo.svg` (the GT mark) and `public/img/favicon.svg`
- [ ] About-us text is in `src/pages/about.astro`; two details are still marked in dashed boxes: the year you started, and the delivery area
- [ ] Real products and photos in place of the samples
- [ ] Check PageSpeed Insights (mobile) on the staging URL after the first deploy
- [ ] Phase 9 of the plan: AI parts assistant and order tracking (`build/catalog.jsonl` is already generated for it)
