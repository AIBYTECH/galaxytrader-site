"""
Turn product photos into fast WebP images, and (optionally) upload them to R2.

    python process_images.py               # convert new/changed photos
    python process_images.py --upload      # ...and upload them to Cloudflare R2
    python process_images.py --force       # re-convert everything

For every photo in photos/ (e.g. GT-10021.jpg) it writes:
    build/img/gt-10021-300.webp   thumbnail for grids and search
    build/img/gt-10021-900.webp   large image for the product page

Photos are placed on a square light-gray canvas so every card lines up.

data/image_manifest.json remembers a hash of each original photo. Only new
or changed photos are processed, and GitHub Actions uses the manifest to
check that every product has an image (the photos themselves never go into Git).
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageOps

import config  # noqa: F401  (importing it loads the .env file with the R2 keys)

ROOT = Path(__file__).parent
PHOTO_DIR = ROOT / "photos"
OUT_DIR = ROOT / "build" / "img"
MANIFEST = ROOT / "data" / "image_manifest.json"

SIZES = (300, 900)                 # output widths in pixels
MIN_SHORT_SIDE = 800               # warn if the original is smaller than this
CANVAS = (245, 245, 244)           # #F5F5F4, the site background colour
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def file_hash(path: Path) -> str:
    """Return a short SHA-256 hash of a file, used to detect changed photos."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def sku_from_filename(path: Path) -> str:
    """'GT-10021.jpg' -> 'GT-10021' (upper-case, as in the workbook)."""
    return path.stem.strip().upper()


def make_square(img: Image.Image, size: int) -> Image.Image:
    """Fit the photo inside a square canvas of `size` px without cropping."""
    img = ImageOps.exif_transpose(img).convert("RGB")   # respect phone rotation
    img.thumbnail((int(size * 0.92), int(size * 0.92)), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), CANVAS)
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def r2_client():
    """Create an S3-compatible client for Cloudflare R2 from environment variables."""
    import boto3  # imported here so the script works without boto3 when not uploading

    needed = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
    missing = [n for n in needed if not os.getenv(n)]
    if missing:
        sys.exit(f"Cannot upload: set {', '.join(missing)} in your .env file.")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert product photos to WebP.")
    parser.add_argument("--upload", action="store_true", help="upload WebP files (and originals) to R2")
    parser.add_argument("--force", action="store_true", help="re-process every photo")
    args = parser.parse_args()

    if not PHOTO_DIR.exists():
        sys.exit("No photos/ folder found. Put product photos there, named by SKU (e.g. GT-10021.jpg).")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    client = r2_client() if args.upload else None
    originals_bucket = os.getenv("R2_ORIGINALS_BUCKET", "")

    done = skipped = 0
    warnings = []
    for path in sorted(PHOTO_DIR.iterdir()):
        if path.suffix.lower() not in EXTENSIONS:
            continue
        sku = sku_from_filename(path)
        digest = file_hash(path)
        outputs = [OUT_DIR / f"{sku.lower()}-{s}.webp" for s in SIZES]

        unchanged = manifest.get(sku, {}).get("hash") == digest and all(o.exists() for o in outputs)
        if unchanged and not args.force and not args.upload:
            skipped += 1
            continue

        try:
            with Image.open(path) as img:
                if min(img.size) < MIN_SHORT_SIDE:
                    warnings.append(f"{path.name}: only {min(img.size)} px on the short side (aim for {MIN_SHORT_SIDE}+)")
                for size, out in zip(SIZES, outputs):
                    make_square(img, size).save(out, "WEBP", quality=80, method=6)
        except Exception as exc:  # a broken file shouldn't stop the whole batch
            warnings.append(f"{path.name}: could not read the image ({exc})")
            continue

        if client:
            for out in outputs:
                client.upload_file(str(out), os.environ["R2_BUCKET"], f"p/{out.name}",
                                   ExtraArgs={"ContentType": "image/webp",
                                              "CacheControl": "public, max-age=31536000, immutable"})
            if originals_bucket:  # private backup of the original photo
                client.upload_file(str(path), originals_bucket, f"originals/{path.name}")

        manifest[sku] = {"hash": digest, "file": path.name}
        done += 1

    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
    print(f"Processed {done} photo(s), skipped {skipped} unchanged.")
    if client:
        print(f"Uploaded to R2 bucket '{os.environ['R2_BUCKET']}' under p/.")
    for w in warnings:
        print("  warning:", w)


if __name__ == "__main__":
    main()
