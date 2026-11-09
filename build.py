"""
Validate the GalaxyTrader workbook and write the data the website is built from.

    python build.py --emit-json   # validate data/products.xlsx, then write JSON for Astro
    python build.py               # only validate (writes build/validation_report.csv)

Steps:
  1. Read the three sheets (products, machines, categories) as text.
  2. Validate every row and write build/validation_report.csv.
     Errors stop the build (so a broken workbook never reaches the live site);
     warnings (e.g. a missing description) don't.
  3. With --emit-json: write src/data/*.json (read by Astro when it builds
     the pages), the search index and filter files in public/data/,
     sitemap.xml, robots.txt, _headers, and build/catalog.jsonl (QR codes).

Then `npm run build` turns the JSON into the static site in dist/.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from openpyxl import load_workbook

import config

ROOT = Path(__file__).parent
DATA_FILE = ROOT / "data" / "products.xlsx"
MANIFEST = ROOT / "data" / "image_manifest.json"
BUILD_DIR = ROOT / "build"

SKU_RE = re.compile(r"^[A-Z0-9-]{3,20}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
STATUSES = {"active", "discontinued", "draft"}


# ---------------------------------------------------------------------------
# Data classes: plain containers for the rows we read from Excel
# ---------------------------------------------------------------------------
@dataclass
class Category:
    id: str
    name: str
    parent_id: str
    intro: str
    children: list = field(default_factory=list)
    products: list = field(default_factory=list)   # products directly or via children

    @property
    def url(self) -> str:
        return f"/c/{self.id}/"


@dataclass
class Machine:
    id: str
    brand: str
    model: str
    aliases: list
    products: list = field(default_factory=list)

    @property
    def label(self) -> str:
        return f"{self.brand} {self.model}"

    @property
    def url(self) -> str:
        return f"/m/{self.id}/"


@dataclass
class Product:
    row: int
    sku: str
    name: str
    category: Category
    subcategory: Category | None
    machines: list
    description: str
    specs: list           # list of (key, value) pairs
    aliases: list
    moq: int | None
    in_stock: bool
    status: str

    @property
    def slug(self) -> str:
        return self.sku.lower()

    @property
    def url(self) -> str:
        # SKU-only URLs never change, so printed QR codes and shared links never break.
        return f"/p/{self.slug}/"

    @property
    def leaf_category(self) -> Category:
        return self.subcategory or self.category


# ---------------------------------------------------------------------------
# 1. Reading the workbook
# ---------------------------------------------------------------------------
def read_sheet(wb, name: str) -> list[dict]:
    """Return a sheet as a list of {header: text} dicts, plus the Excel row number."""
    if name not in wb.sheetnames:
        sys.exit(f"The workbook has no '{name}' sheet. Expected sheets: products, machines, categories.")
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    out = []
    for i, values in enumerate(rows[1:], start=2):
        if all(v is None or str(v).strip() == "" for v in values):
            continue  # skip empty rows
        rec = {}
        for h, v in zip(headers, values):
            if not h:
                continue
            if isinstance(v, float) and v.is_integer():
                v = int(v)  # Excel stores 10 as 10.0
            rec[h] = "" if v is None else str(v).strip()
        rec["_row"] = i
        out.append(rec)
    return out


def split_list(text: str) -> list[str]:
    """'a, b,c' -> ['a', 'b', 'c'] (empty items dropped)."""
    return [x.strip() for x in text.split(",") if x.strip()]


# ---------------------------------------------------------------------------
# 2. Validation
# ---------------------------------------------------------------------------
class Report:
    """Collects problems and writes them to validation_report.csv."""

    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, level: str, sheet: str, row: int, column: str, problem: str, fix: str) -> None:
        self.items.append(dict(level=level, sheet=sheet, row=row, column=column, problem=problem, fix=fix))

    def error(self, *args) -> None:
        self.add("ERROR", *args)

    def warn(self, *args) -> None:
        self.add("warning", *args)

    @property
    def errors(self) -> list[dict]:
        return [i for i in self.items if i["level"] == "ERROR"]

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["level", "sheet", "row", "column", "problem", "fix"])
            w.writeheader()
            w.writerows(self.items)


def load_and_validate(report: Report):
    """Read the workbook, check every rule, and return (categories, machines, products)."""
    if not DATA_FILE.exists():
        sys.exit(f"{DATA_FILE} not found. Run `python make_sample_data.py` to create a sample.")
    wb = load_workbook(DATA_FILE, read_only=True, data_only=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

    # --- categories --------------------------------------------------------
    categories: dict[str, Category] = {}
    raw_cats = read_sheet(wb, "categories")
    for r in raw_cats:
        cid, row = r.get("category_id", "").lower(), r["_row"]
        if not ID_RE.match(cid):
            report.error("categories", row, "category_id", f"'{cid}' is not a valid ID",
                         "Use lowercase letters, numbers and dashes, e.g. presser-feet")
            continue
        if cid in categories:
            report.error("categories", row, "category_id", f"'{cid}' appears twice", "Keep one row per category")
            continue
        if not r.get("name"):
            report.error("categories", row, "name", "Name is empty", "Type the category name")
            continue
        categories[cid] = Category(cid, r["name"], r.get("parent_id", "").lower(), r.get("intro", ""))
    for c in categories.values():
        if c.parent_id:
            if c.parent_id not in categories:
                report.error("categories", 0, "parent_id", f"'{c.id}' has unknown parent '{c.parent_id}'",
                             "Use a category_id from this sheet, or leave it empty")
                c.parent_id = ""
            else:
                categories[c.parent_id].children.append(c)

    # --- machines ----------------------------------------------------------
    machines: dict[str, Machine] = {}
    for r in read_sheet(wb, "machines"):
        mid, row = r.get("machine_id", "").lower(), r["_row"]
        if not ID_RE.match(mid):
            report.error("machines", row, "machine_id", f"'{mid}' is not a valid ID",
                         "Use lowercase letters, numbers and dashes, e.g. juki-ddl8700")
            continue
        if mid in machines:
            report.error("machines", row, "machine_id", f"'{mid}' appears twice", "Keep one row per machine")
            continue
        if not r.get("brand") or not r.get("model"):
            report.error("machines", row, "brand/model", "Brand or model is empty", "Fill both columns")
            continue
        machines[mid] = Machine(mid, r["brand"], r["model"], split_list(r.get("aliases", "")))

    # --- products ----------------------------------------------------------
    products: list[Product] = []
    seen: set[str] = set()
    for r in read_sheet(wb, "products"):
        row = r["_row"]
        status = (r.get("status") or "active").lower()
        if status not in STATUSES:
            report.error("products", row, "status", f"'{status}' is not allowed", "Use active, discontinued or draft")
            continue
        if status == "draft":
            continue  # drafts are skipped on purpose

        sku = r.get("sku", "").upper()
        ok = True
        if not SKU_RE.match(sku):
            report.error("products", row, "sku", f"'{sku}' is not a valid SKU",
                         "3-20 characters: capital letters, numbers and dashes, e.g. GT-10021")
            continue
        if sku in seen:
            report.error("products", row, "sku", f"{sku} appears twice", "Each SKU must be unique")
            continue
        seen.add(sku)

        name = r.get("name", "")
        if not name:
            report.error("products", row, "name", f"{sku} has no name", "Type the part name")
            ok = False

        cat = categories.get(r.get("category_id", "").lower())
        if not cat:
            report.error("products", row, "category_id", f"{sku}: unknown category '{r.get('category_id', '')}'",
                         "Pick a category from the dropdown")
            ok = False
        sub = None
        if r.get("subcategory_id"):
            sub = categories.get(r["subcategory_id"].lower())
            if not sub:
                report.error("products", row, "subcategory_id", f"{sku}: unknown subcategory '{r['subcategory_id']}'",
                             "Pick from the dropdown or leave empty")
                ok = False
            elif cat and sub.parent_id != cat.id:
                report.error("products", row, "subcategory_id", f"{sku}: '{sub.id}' is not inside '{cat.id}'",
                             "Check the parent_id on the categories sheet")
                ok = False

        mlist = []
        for mid in split_list(r.get("machine_ids", "").lower()):
            if mid in machines:
                mlist.append(machines[mid])
            else:
                report.error("products", row, "machine_ids", f"{sku}: unknown machine '{mid}'",
                             "Add it to the machines sheet or fix the spelling")
                ok = False

        specs = []
        for pair in [p for p in r.get("specs", "").split(";") if p.strip()]:
            if ":" not in pair:
                report.error("products", row, "specs", f"{sku}: '{pair.strip()}' has no ':'",
                             "Write specs as Key: Value; Key: Value")
                ok = False
                continue
            k, v = pair.split(":", 1)
            specs.append((k.strip(), v.strip()))

        moq = None
        if r.get("moq"):
            if str(r["moq"]).isdigit() and int(r["moq"]) > 0:
                moq = int(r["moq"])
            else:
                report.error("products", row, "moq", f"{sku}: MOQ '{r['moq']}' is not a whole number", "Type a number like 10")
                ok = False

        stock_text = (r.get("in_stock") or "").lower()
        if stock_text not in {"yes", "no", ""}:
            report.error("products", row, "in_stock", f"{sku}: '{r['in_stock']}' is not Yes/No", "Pick Yes or No")
            ok = False
        if stock_text == "":
            report.warn("products", row, "in_stock", f"{sku}: stock is empty, shown as in stock", "Pick Yes or No")

        if sku not in manifest:
            report.error("products", row, "photo", f"{sku}: no processed photo",
                         f"Put {sku}.jpg in photos/ and run process_images.py")
            ok = False

        if not r.get("description"):
            report.warn("products", row, "description", f"{sku}: no description", "Add one sentence for top-selling parts")

        if ok:
            products.append(Product(row, sku, name, cat, sub, mlist, r.get("description", ""), specs,
                                    split_list(r.get("aliases", "")), moq, stock_text != "no", status))

    # Link products to their categories and machines.
    for p in products:
        p.category.products.append(p)
        if p.subcategory:
            p.subcategory.products.append(p)
        for m in p.machines:
            m.products.append(p)
    return categories, machines, products


def sku_norm(text: str) -> str:
    """Normalise a SKU for search: capitals, no dashes/spaces, letter O read as zero."""
    return re.sub(r"[^A-Z0-9]", "", text.upper()).replace("O", "0")


# ---------------------------------------------------------------------------
# 3. Output: JSON data for the Astro front end
# ---------------------------------------------------------------------------
SRC_DATA = ROOT / "src" / "data"      # read by Astro at build time (not served)
PUBLIC = ROOT / "public"              # copied as-is into dist/ by Astro


def img_url(sku: str, size: int) -> str:
    """URL of a product photo: R2 on the live site, /img/p/ on your PC."""
    name = f"{sku.lower()}-{size}.webp"
    return f"{config.IMG_BASE_URL}/p/{name}" if config.IMG_BASE_URL else f"/img/p/{name}"


def fits_text(p: Product) -> str:
    """'Juki DDL-8700, Brother S-7200 +3' (short text for cards)."""
    text = ", ".join(m.label for m in p.machines[:2])
    return text + (f" +{len(p.machines) - 2}" if len(p.machines) > 2 else "")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def headers_file() -> str:
    """Cloudflare Pages _headers: security headers, strict CSP and caching.

    Astro is configured to emit every script and stylesheet as a file
    (no inline code), so 'self' is enough and no 'unsafe-inline' is needed.
    """
    img_host = ""
    if config.IMG_BASE_URL:
        u = urlparse(config.IMG_BASE_URL)
        img_host = f" {u.scheme}://{u.netloc}"
    csp = ("default-src 'self'; "
           f"img-src 'self' data:{img_host}; "
           "script-src 'self' https://static.cloudflareinsights.com; "
           "connect-src 'self' https://cloudflareinsights.com; "
           "style-src 'self'; font-src 'self'; "
           "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
    return ("/*\n"
            f"  Content-Security-Policy: {csp}\n"
            "  X-Content-Type-Options: nosniff\n"
            "  Referrer-Policy: strict-origin-when-cross-origin\n"
            "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
            "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n"
            "/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n"
            "/img/*\n  Cache-Control: public, max-age=31536000, immutable\n"
            "/data/*\n  Cache-Control: public, max-age=600\n")


def validate():
    """Read and check the workbook; stop with a clear message if there are errors."""
    report = Report()
    categories, machines, products = load_and_validate(report)
    report.write(BUILD_DIR / "validation_report.csv")
    n_err, n_warn = len(report.errors), len(report.items) - len(report.errors)
    print(f"Validation: {len(products)} products OK, {n_err} error(s), {n_warn} warning(s)"
          f" -> build/validation_report.csv")
    for e in report.errors[:15]:
        print(f"  ERROR {e['sheet']} row {e['row']} [{e['column']}]: {e['problem']} -> {e['fix']}")
    if n_err:
        sys.exit("Build stopped: fix the errors above (full list in build/validation_report.csv).")
    return categories, machines, products


def emit_json() -> None:
    """Validate the workbook, then write the data files Astro builds pages from.

    src/data/   site.json, products.json, categories.json, machines.json
    public/     data/search-index.json, data/c/<id>.json (filters),
                sitemap.xml, robots.txt, _headers, img/p/*.webp (PC only)
    build/      catalog.jsonl (for make_qr.py and the future AI assistant)
    """
    categories, machines, products = validate()

    # -- site settings from config.py (one source of truth for both builds) --
    write_json(SRC_DATA / "site.json", {
        "name": config.SITE_NAME, "tagline": config.TAGLINE, "longTagline": config.LONG_TAGLINE,
        "whatsappNumber": config.WHATSAPP_NUMBER, "whatsappDisplay": config.WHATSAPP_DISPLAY,
        "email": config.EMAIL, "address": config.ADDRESS, "hours": config.HOURS,
        "baseUrl": config.BASE_URL, "imgBaseUrl": config.IMG_BASE_URL,
        "perPage": config.PRODUCTS_PER_PAGE, "maxSiteFiles": config.MAX_SITE_FILES,
    })

    # -- products: everything a product page needs ----------------------------
    out_products = []
    for p in products:
        leaf = p.leaf_category
        ids = {m.id for m in p.machines}
        related = [q.sku for q in leaf.products if q is not p and (not ids or ids & {m.id for m in q.machines})]
        out_products.append({
            "sku": p.sku, "slug": p.slug, "url": p.url, "name": p.name,
            "categoryId": p.category.id, "subcategoryId": p.subcategory.id if p.subcategory else "",
            "machineIds": [m.id for m in p.machines], "brands": sorted({m.brand for m in p.machines}),
            "fits": fits_text(p), "description": p.description, "specs": p.specs,
            "aliases": p.aliases, "moq": p.moq, "inStock": p.in_stock, "status": p.status,
            "thumb": img_url(p.sku, 300), "image": img_url(p.sku, 900),
            "related": related[:config.RELATED_LIMIT],
        })
    write_json(SRC_DATA / "products.json", out_products)

    # -- categories (+ the brand/model choices for each category's filters) ---
    out_cats = []
    for c in categories.values():
        brands = defaultdict(set)
        for p in c.products:
            for m in p.machines:
                brands[m.brand].add((m.id, m.model))
        out_cats.append({
            "id": c.id, "name": c.name, "parentId": c.parent_id, "intro": c.intro, "url": c.url,
            "children": [ch.id for ch in c.children],
            "skus": [p.sku for p in sorted(c.products, key=lambda p: p.sku)],
            "filters": {b: sorted([{"id": i, "model": mo} for i, mo in s], key=lambda x: x["model"])
                        for b, s in sorted(brands.items())},
        })
    write_json(SRC_DATA / "categories.json", out_cats)

    # -- machines --------------------------------------------------------------
    write_json(SRC_DATA / "machines.json", [{
        "id": m.id, "brand": m.brand, "model": m.model, "label": m.label, "aliases": m.aliases, "url": m.url,
        "skus": [p.sku for p in sorted(m.products, key=lambda p: (p.category.name, p.sku))],
    } for m in sorted(machines.values(), key=lambda m: (m.brand, m.model))])

    # -- public files: loaded by the browser, so keep them small --------------
    data_dir = PUBLIC / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)       # drop files for categories that no longer exist
    card_keys = ("sku", "name", "url", "thumb", "fits", "brands", "inStock", "status", "moq")
    by_sku = {p["sku"]: p for p in out_products}
    for c in out_cats:
        cards = [{k: by_sku[s][k] for k in card_keys} | {"machines": by_sku[s]["machineIds"]} for s in c["skus"]]
        write_json(data_dir / "c" / f"{c['id']}.json", cards)
    write_json(data_dir / "search-index.json", [{
        "id": p.sku, "sku": p.sku, "skuNorm": sku_norm(p.sku), "name": p.name,
        "aliases": " ".join(p.aliases),
        "machines": " ".join([m.label for m in p.machines] + [a for m in p.machines for a in m.aliases]),
        "category": p.leaf_category.name, "url": p.url, "thumb": img_url(p.sku, 300),
        "fits": fits_text(p), "status": p.status, "inStock": p.in_stock, "moq": p.moq,
    } for p in products])

    urls = ["/", "/machines/", "/about/", "/contact/"] + [c.url for c in categories.values()] \
        + [m.url for m in machines.values() if m.products] + [p.url for p in products]
    today = date.today().isoformat()
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{config.BASE_URL}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls]
    sitemap.append("</urlset>")
    (PUBLIC / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")
    (PUBLIC / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /list/\n\nSitemap: {config.BASE_URL}/sitemap.xml\n")
    (PUBLIC / "_headers").write_text(headers_file())

    # Local preview: copy processed photos in. Live site: they're served from R2.
    img_dir = PUBLIC / "img" / "p"
    if img_dir.exists():
        shutil.rmtree(img_dir)
    if not config.IMG_BASE_URL and (BUILD_DIR / "img").exists():
        img_dir.mkdir(parents=True)
        for f in (BUILD_DIR / "img").glob("*.webp"):
            shutil.copy2(f, img_dir / f.name)

    # -- data for the future AI assistant (kept out of the public site) -----
    with (BUILD_DIR / "catalog.jsonl").open("w", encoding="utf-8") as f:
        for p in products:
            f.write(json.dumps({
                "sku": p.sku, "name": p.name, "category": p.leaf_category.name,
                "machines": [m.id for m in p.machines], "machine_labels": [m.label for m in p.machines],
                "specs": dict(p.specs), "aliases": p.aliases, "description": p.description,
                "in_stock": p.in_stock, "status": p.status, "url": config.BASE_URL + p.url,
            }, ensure_ascii=False) + "\n")

    print(f"Wrote JSON for {len(products)} products, {len(categories)} categories, "
          f"{len(machines)} machines -> src/data/ and public/. Next: npm run build")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate the workbook and write data for the website.")
    parser.add_argument("--emit-json", action="store_true",
                        help="after validating, write JSON for the Astro front end (then run: npm run build)")
    if parser.parse_args().emit_json:
        emit_json()
    else:
        validate()
        print("Workbook is valid. To build the site: python build.py --emit-json && npm run build")
