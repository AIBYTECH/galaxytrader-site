"""
Make a QR code for every part, plus printable A4 label sheets.

    python build.py        # run first: it writes build/catalog.jsonl
    python make_qr.py      # writes build/qr/

Output:
    build/qr/GT-10021.png         one QR per part (for invoices or packaging designs)
    build/qr/GT-10021.svg         same, as a vector (sharp at any print size)
    build/qr/labels-A4.pdf        3 x 8 labels per A4 page: QR + part number + name

Each QR opens https://galaxytraderco.com/p/gt-10021/, so a customer can scan
the label on their last parcel and reorder the same part in seconds.
Only print a sheet for the parts you need:  python make_qr.py --sku 244122 S70F-1/8
"""

import argparse
import json
import sys
import textwrap
from pathlib import Path

import qrcode
import qrcode.image.svg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
CATALOG = ROOT / "build" / "catalog.jsonl"
OUT = ROOT / "build" / "qr"

DPI = 200
A4 = (int(8.27 * DPI), int(11.69 * DPI))     # 1654 x 2338 px
COLS, ROWS = 3, 8                              # 24 labels per page (common 70 x 37 mm sheet)
MARGIN_X, MARGIN_Y = int(0.0 * DPI), int(0.2 * DPI)


def font(size: int, bold: bool = False):
    """Find a TrueType font on Windows or Linux, else fall back to Pillow's default."""
    names = ["DejaVuSans-Bold.ttf", "arialbd.ttf"] if bold else ["DejaVuSans.ttf", "arial.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_qr_image(url: str, box: int) -> Image.Image:
    """Return a square black-and-white QR code image `box` pixels wide."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((box, box), Image.NEAREST)


def main() -> None:
    parser = argparse.ArgumentParser(description="Make QR codes and A4 label sheets.")
    parser.add_argument("--sku", nargs="*", help="only these SKUs (default: all parts)")
    args = parser.parse_args()

    if not CATALOG.exists():
        sys.exit("build/catalog.jsonl not found. Run `python build.py` first.")
    parts = [json.loads(line) for line in CATALOG.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.sku:
        wanted = {s.upper() for s in args.sku}
        parts = [p for p in parts if p["sku"] in wanted]
    if not parts:
        sys.exit("No matching parts.")

    OUT.mkdir(parents=True, exist_ok=True)

    # 1. Single QR files
    for p in parts:
        name = p["sku"].replace("/", "_")      # "/" can't be in a file name (S70F-1/8 -> S70F-1_8.png)
        make_qr_image(p["url"], 600).save(OUT / f"{name}.png")
        svg = qrcode.make(p["url"], image_factory=qrcode.image.svg.SvgPathImage, border=1)
        svg.save(str(OUT / f"{name}.svg"))

    # 2. A4 label sheets
    cell_w = (A4[0] - 2 * MARGIN_X) // COLS
    cell_h = (A4[1] - 2 * MARGIN_Y) // ROWS
    qr_px = cell_h - 40
    f_sku, f_name, f_site = font(34, bold=True), font(24), font(20)
    pages = []
    for start in range(0, len(parts), COLS * ROWS):
        page = Image.new("RGB", A4, "white")
        d = ImageDraw.Draw(page)
        for i, p in enumerate(parts[start:start + COLS * ROWS]):
            col, row = i % COLS, i // COLS
            x0, y0 = MARGIN_X + col * cell_w, MARGIN_Y + row * cell_h
            page.paste(make_qr_image(p["url"], qr_px), (x0 + 20, y0 + 20))
            tx = x0 + 20 + qr_px + 14
            d.text((tx, y0 + 30), p["sku"], fill="black", font=f_sku)
            for j, line in enumerate(textwrap.wrap(p["name"], 16)[:3]):
                d.text((tx, y0 + 80 + j * 30), line, fill="black", font=f_name)
            d.text((tx, y0 + cell_h - 50), "Scan to reorder", fill=(80, 80, 80), font=f_site)
        pages.append(page)
    pdf = OUT / "labels-A4.pdf"
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=DPI)
    print(f"Wrote {len(parts)} QR codes and {len(pages)} label page(s) to {OUT}/")


if __name__ == "__main__":
    main()
