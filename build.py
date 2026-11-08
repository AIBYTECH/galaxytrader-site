"""
Build the GalaxyTrader catalogue website from the Excel workbook.

    python build.py              # validate data/products.xlsx and write the site to dist/
    python build.py --relative   # same, but with relative links (for previews opened as files)

Steps:
  1. Read the three sheets (products, machines, categories) as text.
  2. Validate every row and write build/validation_report.csv.
     Errors stop the build (so a broken workbook never reaches the live site);
     warnings (e.g. a missing description) don't.
  3. Render every page with Jinja2 templates into dist/.
  4. Write the search index, category filter data, sitemap, robots.txt and _headers.
  5. Check the file count stays under the Cloudflare Pages limit.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from openpyxl import load_workbook

import config

ROOT = Path(__file__).parent
DATA_FILE = ROOT / "data" / "products.xlsx"
MANIFEST = ROOT / "data" / "image_manifest.json"
BUILD_DIR = ROOT / "build"
DIST = ROOT / "dist"
STATIC = ROOT / "static"

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


# ---------------------------------------------------------------------------
# 3. Rendering helpers
# ---------------------------------------------------------------------------
class Site:
    """Holds the Jinja environment and writes pages into dist/."""

    def __init__(self, relative: bool) -> None:
        self.relative = relative
        self.env = Environment(loader=FileSystemLoader(ROOT / "templates"),
                               autoescape=select_autoescape(["html", "xml"]),
                               trim_blocks=True, lstrip_blocks=True)
        self.files_written = 0
        self.asset_version = ""

    # -- URL handling -------------------------------------------------------
    def make_url(self, page_path: str):
        """Return a url() function for one page.

        Normally links are root-relative ('/p/gt-10021/'). In --relative mode
        they become file-relative ('../../p/gt-10021/index.html') so the site
        also works when opened from a folder or a preview host.
        """
        page_dir = os.path.dirname(page_path)

        def url(target: str) -> str:
            if target.startswith(("http://", "https://", "mailto:", "#")) or not self.relative:
                return target
            path, _, query = target.partition("?")
            file_path = path.lstrip("/")
            if path.endswith("/"):
                file_path += "index.html"
            rel = os.path.relpath(file_path or "index.html", page_dir or ".")
            return rel + (f"?{query}" if query else "")

        return url

    def img(self, sku: str, size: int) -> str:
        """Root-relative or absolute URL of a product image."""
        name = f"{sku.lower()}-{size}.webp"
        if config.IMG_BASE_URL:
            return f"{config.IMG_BASE_URL}/p/{name}"
        return f"/img/p/{name}"

    def render(self, template: str, out_path: str, **ctx) -> None:
        """Render a template to dist/<out_path>."""
        url = self.make_url(out_path)
        depth = out_path.count("/")
        root = "../" * depth if self.relative else "/"
        html = self.env.get_template(template).render(
            url=url, img=lambda sku, size: url(self.img(sku, size)), cfg=config, root=root,
            relative=self.relative, v=self.asset_version, canonical=config.BASE_URL + "/" + out_path.replace("index.html", ""),
            **ctx)
        dest = DIST / out_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html, encoding="utf-8")
        self.files_written += 1

    def write_json(self, out_path: str, data) -> None:
        dest = DIST / out_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        self.files_written += 1


def wa_link(text: str) -> str:
    """WhatsApp click-to-chat link with a pre-filled message."""
    return f"https://wa.me/{config.WHATSAPP_NUMBER}?text={quote(text)}"


def product_card(site: Site, p: Product) -> dict:
    """The small record used by grids, filters, search and the reorder list."""
    return {
        "sku": p.sku, "name": p.name, "url": p.url,
        "thumb": site.img(p.sku, 300),
        "fits": ", ".join(m.label for m in p.machines[:2]) + (" +" + str(len(p.machines) - 2) if len(p.machines) > 2 else ""),
        "machines": [m.id for m in p.machines],
        "brands": sorted({m.brand for m in p.machines}),
        "inStock": p.in_stock, "status": p.status, "moq": p.moq,
    }


def paginate(items: list, per_page: int) -> list[list]:
    """Split a list into pages (always at least one page)."""
    return [items[i:i + per_page] for i in range(0, len(items), per_page)] or [[]]


def sku_norm(text: str) -> str:
    """Normalise a SKU for search: capitals, no dashes/spaces, letter O read as zero."""
    return re.sub(r"[^A-Z0-9]", "", text.upper()).replace("O", "0")


# ---------------------------------------------------------------------------
# 4. Building the site
# ---------------------------------------------------------------------------
def copy_static(site: Site) -> None:
    """Copy CSS/JS into dist/ and fingerprint them so browsers cache them safely."""
    h = hashlib.sha256()
    for f in sorted(STATIC.rglob("*")):
        if f.is_file():
            h.update(f.read_bytes())
            dest = DIST / f.relative_to(STATIC)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
            site.files_written += 1
    site.asset_version = h.hexdigest()[:10]

    # Local preview: images are copied in. Live site: they're served from R2.
    if not config.IMG_BASE_URL:
        src = BUILD_DIR / "img"
        if src.exists():
            for f in src.glob("*.webp"):
                dest = DIST / "img" / "p" / f.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)
                site.files_written += 1


def build(relative: bool) -> None:
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

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    site = Site(relative)
    copy_static(site)

    top_cats = [c for c in categories.values() if not c.parent_id]
    brands = defaultdict(list)
    for m in sorted(machines.values(), key=lambda m: (m.brand, m.model)):
        brands[m.brand].append(m)
    machine_data = {b: [{"id": m.id, "model": m.model, "count": len(m.products)} for m in ms if m.products]
                    for b, ms in brands.items()}
    machine_data = {b: ms for b, ms in machine_data.items() if ms}
    common = dict(top_cats=top_cats, year=date.today().year)

    # -- home ---------------------------------------------------------------
    site.render("home.html", "index.html", machine_data=machine_data, n_products=len(products),
                n_brands=len(machine_data), **common)

    # -- product pages ------------------------------------------------------
    for p in products:
        leaf = p.leaf_category
        machine_ids = {m.id for m in p.machines}
        related = [q for q in leaf.products if q is not p and (not machine_ids or machine_ids & {m.id for m in q.machines})]
        related = related[:config.RELATED_LIMIT]
        page_link = f"{config.BASE_URL}{p.url}"
        if p.status == "discontinued":
            msg = f"Hi {config.SITE_NAME}, part {p.sku} ({p.name}) is discontinued. Can you suggest an alternative? {page_link}"
        else:
            msg = f"Hi {config.SITE_NAME}, I want to ask about part {p.sku} - {p.name}. {page_link}"
        crumbs = [("Home", "/"), (p.category.name, p.category.url)]
        if p.subcategory:
            crumbs.append((p.subcategory.name, p.subcategory.url))
        site.render("product.html", f"p/{p.slug}/index.html", p=p, related=[product_card(site, q) for q in related],
                    wa=wa_link(msg), crumbs=crumbs, me=product_card(site, p), **common)

    # -- category pages (static pages for SEO + JSON for browser filters) ---
    for c in categories.values():
        cards = [product_card(site, p) for p in sorted(c.products, key=lambda p: p.sku)]
        pages = paginate(cards, config.PRODUCTS_PER_PAGE)
        crumbs = [("Home", "/")]
        if c.parent_id:
            parent = categories[c.parent_id]
            crumbs.append((parent.name, parent.url))
        cat_brands = defaultdict(set)
        for p in c.products:
            for m in p.machines:
                cat_brands[m.brand].add((m.id, m.model))
        filters = {b: sorted([{"id": i, "model": mo} for i, mo in s], key=lambda x: x["model"]) for b, s in sorted(cat_brands.items())}
        for n, page in enumerate(pages, start=1):
            out = f"c/{c.id}/index.html" if n == 1 else f"c/{c.id}/page/{n}/index.html"
            site.render("listing.html", out, title=c.name, intro=c.intro, items=page, page_no=n, n_pages=len(pages),
                        base=c.url, total=len(cards), crumbs=crumbs, children=c.children, filters=filters,
                        data_url=f"/data/c/{c.id}.json", kind="category", **common)
        site.write_json(f"data/c/{c.id}.json", cards)

    # -- machine pages ------------------------------------------------------
    for m in machines.values():
        if not m.products:
            continue
        cards = [product_card(site, p) for p in sorted(m.products, key=lambda p: (p.category.name, p.sku))]
        pages = paginate(cards, config.PRODUCTS_PER_PAGE)
        intro = f"All spare parts we stock that fit the {m.label}."
        if m.aliases:
            intro += f" Also known as: {', '.join(m.aliases)}."
        for n, page in enumerate(pages, start=1):
            out = f"m/{m.id}/index.html" if n == 1 else f"m/{m.id}/page/{n}/index.html"
            site.render("listing.html", out, title=f"Parts for {m.label}", intro=intro, items=page, page_no=n,
                        n_pages=len(pages), base=m.url, total=len(cards), crumbs=[("Home", "/"), ("Machines", "/machines/")],
                        children=[], filters={}, data_url="", kind="machine", **common)

    site.render("machines.html", "machines/index.html", brands=brands, **common)

    # -- simple pages -------------------------------------------------------
    for tpl, out in [("search.html", "search/index.html"), ("list.html", "list/index.html"),
                     ("about.html", "about/index.html"), ("contact.html", "contact/index.html"),
                     ("privacy.html", "privacy/index.html"), ("404.html", "404.html")]:
        site.render(tpl, out, **common)

    # -- search index -------------------------------------------------------
    index = []
    for p in products:
        index.append({
            "id": p.sku, "sku": p.sku, "skuNorm": sku_norm(p.sku), "name": p.name,
            "aliases": " ".join(p.aliases),
            "machines": " ".join([m.label for m in p.machines] + [a for m in p.machines for a in m.aliases]),
            "category": p.leaf_category.name, "url": p.url, "thumb": site.img(p.sku, 300),
            "fits": product_card(site, p)["fits"], "status": p.status,
        })
    site.write_json("data/search-index.json", index)

    # -- data for the future AI assistant (kept out of the public site) -----
    with (BUILD_DIR / "catalog.jsonl").open("w", encoding="utf-8") as f:
        for p in products:
            f.write(json.dumps({
                "sku": p.sku, "name": p.name, "category": p.leaf_category.name,
                "machines": [m.id for m in p.machines], "machine_labels": [m.label for m in p.machines],
                "specs": dict(p.specs), "aliases": p.aliases, "description": p.description,
                "in_stock": p.in_stock, "status": p.status, "url": config.BASE_URL + p.url,
            }, ensure_ascii=False) + "\n")

    # -- SEO and hosting files ----------------------------------------------
    urls = ["/", "/machines/", "/about/", "/contact/"] + [c.url for c in categories.values()] \
        + [m.url for m in machines.values() if m.products] + [p.url for p in products]
    today = date.today().isoformat()
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{config.BASE_URL}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls]
    sitemap.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /list/\n\nSitemap: {config.BASE_URL}/sitemap.xml\n")
    img_host = ""
    if config.IMG_BASE_URL:
        u = urlparse(config.IMG_BASE_URL)
        img_host = f" {u.scheme}://{u.netloc}"
    csp = ("default-src 'self'; "
           f"img-src 'self' data:{img_host}; "
           "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com; "
           "connect-src 'self' https://cloudflareinsights.com; "
           "style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
           "frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    (DIST / "_headers").write_text(
        "/*\n"
        f"  Content-Security-Policy: {csp}\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "/css/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/js/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/img/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/data/*\n  Cache-Control: public, max-age=600\n")
    site.files_written += 3

    # -- file count check ---------------------------------------------------
    total = sum(1 for f in DIST.rglob("*") if f.is_file())
    print(f"Built {total} files in dist/ ({len(products)} products, {len(categories)} categories, "
          f"{sum(1 for m in machines.values() if m.products)} machine pages).")
    if total > config.MAX_SITE_FILES:
        sys.exit(f"Too many files ({total}); Cloudflare Pages allows 20,000. Serve images from R2 (set IMG_BASE_URL).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the GalaxyTrader catalogue.")
    parser.add_argument("--relative", action="store_true", help="use relative links (for previews opened from a folder)")
    build(parser.parse_args().relative)
