"""
Create a sample workbook (data/products.xlsx) and placeholder photos (photos/).

Run this once to try the site before the real product data is ready:

    python make_sample_data.py

The workbook has the three sheets the build expects (products, machines,
categories) with dropdowns, so it also works as the TEMPLATE the team fills in.
Delete the sample rows and type the real ones.

Use --force to overwrite an existing workbook.
"""

import argparse
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
DATA_FILE = ROOT / "data" / "products.xlsx"
PHOTO_DIR = ROOT / "photos"

# ---------------------------------------------------------------------------
# Sample reference lists
# ---------------------------------------------------------------------------
CATEGORIES = [
    # category_id, name, parent_id, intro
    ("hooks-bobbins", "Hooks & Bobbins", "", "Rotary hooks, bobbin cases and bobbins for lockstitch machines."),
    ("rotary-hooks", "Rotary Hooks", "hooks-bobbins", "Rotary hooks for single-needle and twin-needle lockstitch machines."),
    ("bobbin-cases", "Bobbin Cases", "hooks-bobbins", "Bobbin cases with tension springs for industrial lockstitch machines."),
    ("bobbins", "Bobbins", "hooks-bobbins", "Aluminium and steel bobbins, sold in packs."),
    ("presser-feet", "Presser Feet", "", "Standard, hinged, teflon and compensating presser feet."),
    ("needles", "Needles", "", "Industrial needles by system and size."),
    ("needle-plates", "Needle Plates & Feed Dogs", "", "Needle plates and feed dogs for lockstitch and overlock machines."),
    ("knives", "Knives & Cutters", "", "Upper and lower knives for overlock and buttonhole machines."),
    ("loopers", "Loopers", "", "Upper and lower loopers for overlock and interlock machines."),
    ("tools", "Tools & Attachments", "", "Screwdrivers, gauges, folders and other workshop items."),
]

MACHINES = [
    # machine_id, brand, model, aliases
    ("juki-ddl8700", "Juki", "DDL-8700", "DDL8700, DDL 8700, 8700"),
    ("juki-ddl5550", "Juki", "DDL-5550", "DDL5550, 5550"),
    ("juki-mo6714s", "Juki", "MO-6714S", "MO6714, 6714 overlock"),
    ("juki-lbh1790", "Juki", "LBH-1790", "LBH1790, buttonhole 1790"),
    ("brother-s7000", "Brother", "S-7000DD", "S7000, Nexio"),
    ("brother-lh4b814", "Brother", "LH4-B814", "B814, buttonhole 814"),
    ("jack-f4", "Jack", "F4", "Jack F-4"),
    ("jack-e4", "Jack", "E4", "Jack E-4 overlock"),
    ("siruba-747k", "Siruba", "747K", "747, Siruba 747"),
    ("pegasus-m900", "Pegasus", "M900", "M-900, Pegasus 900"),
    ("typical-gc6150", "Typical", "GC6150", "GC 6150, 6150"),
    ("kansai-dfb1404", "Kansai Special", "DFB-1404", "DFB1404, Kansai 1404"),
]

LOCKSTITCH = "juki-ddl8700, juki-ddl5550, brother-s7000, jack-f4, typical-gc6150"
OVERLOCK = "juki-mo6714s, jack-e4, siruba-747k, pegasus-m900"

# sku, name, category, subcategory, machine_ids, description, specs, aliases, moq, in_stock, status, shape
PRODUCTS = [
    ("GT-10021", "Large rotary hook", "hooks-bobbins", "rotary-hooks", "juki-ddl8700, juki-ddl5550, typical-gc6150",
     "Large-capacity rotary hook for single-needle lockstitch machines. Replace when stitches skip or thread breaks at the hook point.",
     "Type: Rotary hook; Capacity: Large; Material: Hardened steel", "hook 8700, kanda", 10, "Yes", "active", "hook"),
    ("GT-10024", "Rotary hook for thick fabric", "hooks-bobbins", "rotary-hooks", "juki-ddl8700, brother-s7000",
     "Rotary hook for denim and heavy fabrics.", "Type: Rotary hook; Use: Heavy fabric; Material: Hardened steel", "denim hook", 10, "Yes", "active", "hook"),
    ("GT-10031", "Rotary hook, standard", "hooks-bobbins", "rotary-hooks", "jack-f4, typical-gc6150",
     "", "Type: Rotary hook; Capacity: Standard", "", 10, "No", "active", "hook"),
    ("GT-10108", "Aluminium bobbins, pack of 100", "hooks-bobbins", "bobbins", LOCKSTITCH,
     "Lightweight aluminium bobbins for single-needle lockstitch machines.", "Material: Aluminium; Pack: 100 pcs", "bobbin, aluminium bobbin", 1, "Yes", "active", "bobbin"),
    ("GT-10109", "Steel bobbins, pack of 100", "hooks-bobbins", "bobbins", LOCKSTITCH,
     "Steel bobbins for longer life on high-speed machines.", "Material: Steel; Pack: 100 pcs", "steel bobbin", 1, "Yes", "active", "bobbin"),
    ("GT-10115", "Bobbin case with spring", "hooks-bobbins", "bobbin-cases", "juki-ddl8700, brother-s7000, jack-f4",
     "Bobbin case with tension spring and latch.", "Type: Bobbin case; Includes: Tension spring", "bobbin case, masoora", 10, "Yes", "active", "case"),
    ("GT-10117", "Bobbin case, large capacity", "hooks-bobbins", "bobbin-cases", "juki-ddl5550",
     "", "Type: Bobbin case; Capacity: Large", "", 10, "Yes", "active", "case"),
    ("GT-20034", "Standard hinged presser foot", "presser-feet", "", "juki-ddl8700, juki-ddl5550, jack-f4",
     "Hinged presser foot for general sewing on lockstitch machines.", "Type: Hinged; Width: Standard", "foot, paon", 10, "Yes", "active", "foot"),
    ("GT-20041", "Teflon presser foot", "presser-feet", "", LOCKSTITCH,
     "Teflon foot for leather, vinyl and coated fabrics.", "Type: Teflon; Use: Leather and vinyl", "teflon foot", 10, "Yes", "active", "foot"),
    ("GT-20052", "Compensating foot, 1/16 inch", "presser-feet", "", "juki-ddl8700, brother-s7000",
     "Compensating foot for edge and top stitching.", "Type: Compensating; Gauge: 1/16 inch", "edge foot", 10, "Yes", "active", "foot"),
    ("GT-20060", "Zipper foot, narrow", "presser-feet", "", LOCKSTITCH,
     "", "Type: Zipper; Width: Narrow", "zip foot", 10, "Yes", "active", "foot"),
    ("GT-20077", "Overlock presser foot", "presser-feet", "", OVERLOCK,
     "", "Type: Overlock foot", "", 5, "Yes", "active", "foot"),
    ("GT-30014", "DBx1 needles, size 14, pack of 100", "needles", "", LOCKSTITCH,
     "System DBx1 needles for single-needle lockstitch machines.", "System: DBx1; Size: 14 (90); Pack: 100 pcs", "needle 14, sui", 1, "Yes", "active", "needle"),
    ("GT-30016", "DBx1 needles, size 16, pack of 100", "needles", "", LOCKSTITCH,
     "", "System: DBx1; Size: 16 (100); Pack: 100 pcs", "needle 16", 1, "Yes", "active", "needle"),
    ("GT-30111", "DCx27 needles, size 11, pack of 100", "needles", "", OVERLOCK,
     "System DCx27 needles for overlock machines.", "System: DCx27; Size: 11 (75); Pack: 100 pcs", "overlock needle", 1, "Yes", "active", "needle"),
    ("GT-40052", "Needle plate, 3-row feed", "needle-plates", "", "siruba-747k, jack-e4",
     "Needle plate for 3-row feed overlock machines.", "Type: Needle plate; Feed: 3-row", "plate, pleet", 5, "Yes", "active", "plate"),
    ("GT-40060", "Needle plate, single needle", "needle-plates", "", "juki-ddl8700, juki-ddl5550",
     "", "Type: Needle plate; Needles: 1", "", 5, "Yes", "active", "plate"),
    ("GT-40077", "Feed dog, fine teeth", "needle-plates", "", "pegasus-m900, juki-mo6714s",
     "Fine-tooth feed dog for light fabrics on overlock machines.", "Type: Feed dog; Teeth: Fine", "feed dog, dandi", 5, "Yes", "active", "feed"),
    ("GT-40081", "Feed dog, medium teeth", "needle-plates", "", "juki-ddl8700, jack-f4",
     "", "Type: Feed dog; Teeth: Medium", "", 5, "No", "active", "feed"),
    ("GT-50009", "Upper knife, carbide", "knives", "", "juki-mo6714s, jack-e4",
     "Carbide upper knife for overlock machines.", "Type: Upper knife; Material: Carbide", "knife, chaku, blade", 10, "Yes", "active", "knife"),
    ("GT-50011", "Lower knife, steel", "knives", "", "juki-mo6714s, siruba-747k, pegasus-m900",
     "", "Type: Lower knife; Material: Steel", "lower blade", 10, "Yes", "active", "knife"),
    ("GT-50020", "Buttonhole knife, 1/2 inch", "knives", "", "juki-lbh1790, brother-lh4b814",
     "Cutting knife for buttonhole machines.", "Type: Buttonhole knife; Size: 1/2 inch", "kaj knife", 10, "Yes", "active", "knife"),
    ("GT-60003", "Upper looper", "loopers", "", "siruba-747k, jack-e4",
     "Upper looper for 4-thread overlock machines.", "Type: Upper looper; Threads: 4", "looper", 5, "Yes", "active", "looper"),
    ("GT-60004", "Lower looper", "loopers", "", "siruba-747k, jack-e4, juki-mo6714s",
     "", "Type: Lower looper; Threads: 4", "", 5, "Yes", "active", "looper"),
    ("GT-60015", "Interlock looper", "loopers", "", "kansai-dfb1404, pegasus-m900",
     "", "Type: Looper; Machine type: Interlock", "", 5, "Yes", "discontinued", "looper"),
    ("GT-70001", "Screwdriver set, 6 pieces", "tools", "", "",
     "Screwdriver set sized for sewing machine screws.", "Pieces: 6", "pech kas", 1, "Yes", "active", "tool"),
    ("GT-70010", "Hemming folder, 1/4 inch", "tools", "", LOCKSTITCH,
     "Hemming folder for narrow hems.", "Type: Hemming folder; Size: 1/4 inch", "folder", 1, "Yes", "active", "folder"),
    ("GT-70011", "Binding folder, 1 inch", "tools", "", "kansai-dfb1404",
     "", "Type: Binding folder; Size: 1 inch", "", 1, "Yes", "active", "folder"),
    ("GT-70099", "Thread stand, 2 spools", "tools", "", "",
     "", "Spools: 2", "", 1, "Yes", "draft", "tool"),
]

HEADERS = ["sku", "name", "category_id", "subcategory_id", "machine_ids", "description",
           "specs", "aliases", "moq", "in_stock", "status", "photo"]


def build_workbook() -> None:
    """Write data/products.xlsx with three sheets and dropdowns."""
    wb = Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="1A1A1A")

    # --- products sheet ----------------------------------------------------
    ws = wb.active
    ws.title = "products"
    ws.append(HEADERS)
    for p in PRODUCTS:
        sku = p[0]
        ws.append([sku, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], f"{sku}.jpg"])
    for cell in ws[1]:
        cell.font, cell.fill = head_font, head_fill
    widths = [12, 34, 16, 16, 40, 50, 46, 22, 6, 9, 13, 16]
    for col, w in zip("ABCDEFGHIJKL", widths):
        ws.column_dimensions[col].width = w
    # Store SKU column as text so Excel never drops leading zeros.
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=1):
        row[0].number_format = "@"
    ws.freeze_panes = "B2"

    # --- machines sheet ----------------------------------------------------
    wm = wb.create_sheet("machines")
    wm.append(["machine_id", "brand", "model", "aliases"])
    for m in MACHINES:
        wm.append(list(m))
    for cell in wm[1]:
        cell.font, cell.fill = head_font, head_fill
    for col, w in zip("ABCD", [18, 16, 14, 30]):
        wm.column_dimensions[col].width = w

    # --- categories sheet --------------------------------------------------
    wc = wb.create_sheet("categories")
    wc.append(["category_id", "name", "parent_id", "intro"])
    for c in CATEGORIES:
        wc.append(list(c))
    for cell in wc[1]:
        cell.font, cell.fill = head_font, head_fill
    for col, w in zip("ABCD", [18, 26, 16, 70]):
        wc.column_dimensions[col].width = w

    # --- dropdowns on the products sheet -----------------------------------
    last = 5000  # leave room for the full catalogue
    dropdowns = [
        ("C", f"=categories!$A$2:$A$500"),
        ("D", f"=categories!$A$2:$A$500"),
        ("J", '"Yes,No"'),
        ("K", '"active,discontinued,draft"'),
    ]
    for col, formula in dropdowns:
        dv = DataValidation(type="list", formula1=formula, allow_blank=True)
        dv.add(f"{col}2:{col}{last}")
        ws.add_data_validation(dv)

    # --- a short "how to fill" sheet ---------------------------------------
    wh = wb.create_sheet("how to fill", 0)
    rows = [
        ["How to fill this workbook"],
        [""],
        ["products", "One row per part. sku is required and never changes (e.g. GT-10021)."],
        ["", "category_id / subcategory_id: pick from the dropdown (comes from the categories sheet)."],
        ["", "machine_ids: comma-separated IDs from the machines sheet, e.g. juki-ddl8700, jack-f4"],
        ["", "specs: Key: Value; Key: Value  (e.g. System: DBx1; Size: 14)"],
        ["", "aliases: other names customers use, comma-separated (e.g. kanda, hook 8700)"],
        ["", "status: active = shown, discontinued = shown with 'ask for alternative', draft = hidden"],
        ["", "photo: file name in the photos folder, e.g. GT-10021.jpg (min 800 px on the short side)"],
        ["machines", "Add every machine model customers own. machine_id must be lowercase-with-dashes."],
        ["categories", "parent_id is empty for main categories, or the category_id of the parent."],
    ]
    for r in rows:
        wh.append(r)
    wh["A1"].font = Font(bold=True, size=14)
    wh.column_dimensions["A"].width = 14
    wh.column_dimensions["B"].width = 100

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    wb.save(DATA_FILE)


# ---------------------------------------------------------------------------
# Placeholder photos: simple drawings so the site has something to show.
# Replace them with real photos (same file names) later.
# ---------------------------------------------------------------------------
def draw_part(shape: str, draw: ImageDraw.ImageDraw, s: int) -> None:
    """Draw a very simple outline of a part type on a square canvas of size s."""
    ink, metal, dark = (40, 40, 40), (196, 202, 210), (140, 148, 158)
    c = s // 2
    w = max(6, s // 110)
    if shape == "hook":
        draw.ellipse([c - 300, c - 280, c + 300, c + 320], fill=metal, outline=ink, width=w)
        draw.ellipse([c - 190, c - 170, c + 190, c + 210], fill=(245, 245, 244), outline=ink, width=w)
        draw.ellipse([c - 60, c - 40, c + 60, c + 80], fill=dark, outline=ink, width=w)
        draw.arc([c + 120, c - 420, c + 420, c - 120], 120, 230, fill=ink, width=w * 2)
    elif shape == "bobbin":
        draw.ellipse([c - 280, c - 280, c + 280, c + 280], fill=metal, outline=ink, width=w)
        for dx, dy in [(0, -150), (130, 75), (-130, 75)]:
            draw.ellipse([c + dx - 55, c + dy - 55, c + dx + 55, c + dy + 55], fill=(245, 245, 244), outline=ink, width=w)
        draw.ellipse([c - 60, c - 60, c + 60, c + 60], fill=(245, 245, 244), outline=ink, width=w)
    elif shape == "case":
        draw.ellipse([c - 260, c - 240, c + 220, c + 240], fill=metal, outline=ink, width=w)
        draw.ellipse([c - 140, c - 120, c + 100, c + 120], fill=(245, 245, 244), outline=ink, width=w)
        draw.rounded_rectangle([c + 200, c - 50, c + 360, c + 50], 20, fill=dark, outline=ink, width=w)
    elif shape == "foot":
        draw.rectangle([c - 70, c - 360, c + 70, c + 20], fill=metal, outline=ink, width=w)
        draw.rounded_rectangle([c - 330, c + 20, c + 330, c + 160], 40, fill=metal, outline=ink, width=w)
        draw.line([c, c + 20, c, c + 160], fill=ink, width=w)
    elif shape == "needle":
        draw.rectangle([c - 40, c - 400, c + 40, c - 150], fill=metal, outline=ink, width=w)
        draw.polygon([(c - 18, c - 150), (c + 18, c - 150), (c, c + 400)], fill=dark, outline=ink)
        draw.ellipse([c - 8, c + 180, c + 8, c + 240], fill=ink)
    elif shape == "plate":
        draw.rounded_rectangle([c - 360, c - 220, c + 360, c + 220], 40, fill=metal, outline=ink, width=w)
        for dx in (-120, 0, 120):
            draw.rounded_rectangle([c + dx - 25, c - 120, c + dx + 25, c + 120], 20, fill=(245, 245, 244), outline=ink, width=w)
    elif shape == "feed":
        draw.rectangle([c - 340, c + 40, c + 340, c + 160], fill=metal, outline=ink, width=w)
        pts = []
        for i in range(12):
            x = c - 330 + i * 56
            pts += [(x, c + 40), (x + 28, c - 60)]
        pts += [(c + 340, c + 40)]
        draw.line(pts, fill=ink, width=w)
    elif shape == "knife":
        draw.polygon([(c - 330, c + 200), (c + 150, c - 280), (c + 300, c - 130), (c - 180, c + 350)], fill=metal, outline=ink)
        draw.line([(c - 260, c + 280), (c + 220, c - 200)], fill=dark, width=w)
    elif shape == "looper":
        draw.rounded_rectangle([c - 330, c + 150, c - 110, c + 300], 20, fill=metal, outline=ink, width=w)
        draw.arc([c - 300, c - 300, c + 400, c + 400], 200, 290, fill=ink, width=w * 4)
    elif shape == "folder":
        draw.polygon([(c - 380, c - 160), (c + 120, c - 60), (c + 380, c - 40), (c + 380, c + 40), (c + 120, c + 60), (c - 380, c + 160)],
                     fill=metal, outline=ink)
    else:  # tool
        draw.rounded_rectangle([c - 330, c + 120, c - 120, c + 220], 30, fill=dark, outline=ink, width=w)
        draw.line([(c - 120, c + 170), (c + 360, c + 170)], fill=ink, width=w * 2)


def sample_photo(sku: str) -> Image.Image | None:
    """Draw the 1000x1000 placeholder photo for a sample SKU (None if it isn't one).

    build.py also uses this, so a fresh clone (with no photos/ folder) still
    shows the sample photos on a local or preview build.
    """
    shape = next((p[11] for p in PRODUCTS if p[0] == sku), None)
    if shape is None:
        return None
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 44)
    except OSError:
        font = ImageFont.load_default()
    img = Image.new("RGB", (1000, 1000), (255, 255, 255))
    d = ImageDraw.Draw(img)
    draw_part(shape, d, 1000)
    d.text((40, 930), f"{sku}  (sample photo)", fill=(120, 120, 120), font=font)
    return img


def build_photos() -> None:
    """Create a 1000x1000 JPG placeholder for each sample product."""
    PHOTO_DIR.mkdir(exist_ok=True)
    for p in PRODUCTS:
        sample_photo(p[0]).save(PHOTO_DIR / f"{p[0]}.jpg", quality=88)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create sample workbook and photos.")
    parser.add_argument("--force", action="store_true", help="overwrite an existing workbook")
    args = parser.parse_args()

    if DATA_FILE.exists() and not args.force:
        print(f"{DATA_FILE} already exists. Use --force to overwrite it.")
    else:
        build_workbook()
        print(f"Wrote {DATA_FILE}")
    build_photos()
    print(f"Wrote {len(PRODUCTS)} placeholder photos to {PHOTO_DIR}/")


if __name__ == "__main__":
    main()
