"""
Turn product photos into fast WebP images, and (optionally) upload them to R2.

    python process_images.py               # convert new/changed photos
    python process_images.py --upload      # ...and upload them to Cloudflare R2
    python process_images.py --force       # re-convert everything

For every photo in photos/ (e.g. 244122.png) it writes:
    build/img/244122-300.webp   thumbnail for grids and search
    build/img/244122-900.webp   large image for the product page

Photos are placed on a square light-gray canvas so every card lines up.

data/image_manifest.json remembers a hash of each original photo (and whether
it is on R2). Only new or changed photos are processed or uploaded, and the
build uses the manifest to know which parts have a photo (the photos
themselves never go into Git). Parts without a photo show "Photo coming soon".

With the whole catalogue (10,000+ photos) the work runs in parallel: all CPU
cores convert, 16 connections upload. An interrupted run can simply be
started again; the manifest is saved every 500 photos.
"""

import argparse
import hashlib
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
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
    """Fit the photo inside a square canvas of `size` px without cropping.
    Small catalogue pictures are not blown up past twice their size."""
    img = ImageOps.exif_transpose(img).convert("RGB")   # respect phone rotation
    target = int(size * 0.92)
    if max(img.size) * 2 < target:
        target = max(img.size) * 2
    scale = target / max(img.size)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), CANVAS)
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def convert(path: Path) -> tuple[str, str]:
    """Write the WebP sizes of one photo. Returns (sku, warning or '')."""
    sku = sku_from_filename(path)
    warning = ""
    try:
        with Image.open(path) as img:
            if min(img.size) < MIN_SHORT_SIDE and img.width * img.height > 0:
                warning = "small"
            for size in SIZES:
                make_square(img, size).save(OUT_DIR / f"{sku.lower()}-{size}.webp", "WEBP", quality=80, method=4)
    except Exception as exc:  # a broken file shouldn't stop the whole batch
        return sku, f"{path.name}: could not read the image ({exc})"
    return sku, warning


def r2_client():
    """Create an S3-compatible client for Cloudflare R2 from environment variables."""
    import boto3  # imported here so the script works without boto3 when not uploading
    from botocore.config import Config

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
        config=Config(max_pool_connections=32, retries={"max_attempts": 5}),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert product photos to WebP.")
    parser.add_argument("--upload", action="store_true", help="upload WebP files (and originals) to R2")
    parser.add_argument("--force", action="store_true", help="re-process (and re-upload) every photo")
    parser.add_argument("--jobs", type=int, default=os.cpu_count() or 4, help="parallel conversions")
    args = parser.parse_args()

    if not PHOTO_DIR.exists():
        sys.exit("No photos/ folder found. Put product photos there, named by SKU (e.g. 244122.png).")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    client = r2_client() if args.upload else None
    bucket = os.getenv("R2_BUCKET", "")
    originals_bucket = os.getenv("R2_ORIGINALS_BUCKET", "")

    photos = sorted(p for p in PHOTO_DIR.iterdir() if p.suffix.lower() in EXTENSIONS)
    # Photos that disappeared from photos/ are dropped from the manifest
    present = {sku_from_filename(p) for p in photos}
    for sku in [s for s in manifest if s not in present]:
        del manifest[sku]

    todo, hashes = [], {}
    for path in photos:
        sku = sku_from_filename(path)
        digest = file_hash(path)
        hashes[sku] = (digest, path)
        outputs = [OUT_DIR / f"{sku.lower()}-{s}.webp" for s in SIZES]
        unchanged = manifest.get(sku, {}).get("hash") == digest and all(o.exists() for o in outputs)
        if not unchanged or args.force:
            todo.append(path)

    warnings, small = [], 0
    if todo:
        print(f"Converting {len(todo)} photo(s) with {args.jobs} worker(s)...", flush=True)
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for i, (sku, warning) in enumerate(pool.map(convert, todo, chunksize=16), start=1):
                if warning == "small":
                    small += 1
                elif warning:
                    warnings.append(warning)
                    continue
                digest, path = hashes[sku]
                manifest[sku] = {"hash": digest, "file": path.name}   # new/changed: not uploaded yet
                if i % 500 == 0:
                    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
                    print(f"  {i}/{len(todo)}", flush=True)
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
    print(f"Converted {len(todo) - len(warnings)} photo(s), {len(photos) - len(todo)} unchanged.")

    if client:
        to_upload = [s for s in manifest if args.force or manifest[s].get("r2") != manifest[s]["hash"]]
        print(f"Uploading {len(to_upload)} part(s) to R2 bucket '{bucket}'...", flush=True)

        def upload(sku: str) -> str:
            for size in SIZES:
                out = OUT_DIR / f"{sku.lower()}-{size}.webp"
                client.upload_file(str(out), bucket, f"p/{out.name}",
                                   ExtraArgs={"ContentType": "image/webp",
                                              "CacheControl": "public, max-age=31536000, immutable"})
            if originals_bucket:  # private backup of the original photo
                path = hashes[sku][1]
                client.upload_file(str(path), originals_bucket, f"originals/{path.name}")
            return sku

        with ThreadPoolExecutor(max_workers=16) as pool:
            for i, sku in enumerate(pool.map(upload, to_upload), start=1):
                manifest[sku]["r2"] = manifest[sku]["hash"]
                if i % 500 == 0:
                    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
                    print(f"  {i}/{len(to_upload)}", flush=True)
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
        print(f"Uploaded {len(to_upload)} part(s) to R2 under p/.")

    if small:
        print(f"  note: {small} photo(s) are smaller than {MIN_SHORT_SIDE} px (catalogue pictures); "
              "they are shown at up to twice their size, never blown up further.")
    for w in warnings:
        print("  warning:", w)


if __name__ == "__main__":
    main()
