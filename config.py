"""
Site-wide settings for the GalaxyTrader catalogue.

Everything a non-developer might want to change (phone number, email,
address) lives here; build.py --emit-json passes it to the website as
src/data/site.json, so the pages never hard-code it.
Values that differ between your PC and the live site (like where images
are served from) are read from environment variables / a .env file.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project folder (if it exists). On GitHub Actions the
# same names come from repository secrets/variables instead.
load_dotenv(Path(__file__).parent / ".env")

# ---------------------------------------------------------------------------
# Business details (shown in the header, footer and contact page)
# ---------------------------------------------------------------------------
SITE_NAME = "GalaxyTrader"
TAGLINE = "Industrial sewing machine spare parts"
LONG_TAGLINE = "Textile, electronic and hardware spare parts for factories and mechanics across Pakistan."

# WhatsApp number in international format, digits only, no "+" or spaces.
# Example: 923001234567. The real values live in .env (and GitHub variables).
WHATSAPP_NUMBER = os.getenv("WHATSAPP_NUMBER") or "923348118152"
WHATSAPP_DISPLAY = os.getenv("WHATSAPP_DISPLAY") or "+92 334 8118152"

EMAIL = "info@galaxytraderco.com"
ADDRESS = "Shop # 8, Euro Grand Park, Plot # 1K/6, Nazimabad No. 1, Karachi 74600"
HOURS = "Mon–Sat, 10am–7pm"

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------
# Public address of the live site, used for canonical URLs, the sitemap,
# QR codes and the link inside WhatsApp messages.
BASE_URL = (os.getenv("BASE_URL") or "https://galaxytraderco.com").rstrip("/")

# Where product photos are served from.
#   - Live site: Cloudflare R2 on its own sub-domain, e.g. https://img.galaxytraderco.com
#   - Your PC / preview: leave empty and the build copies photos into dist/img/
IMG_BASE_URL = (os.getenv("IMG_BASE_URL") or "").rstrip("/")

# ---------------------------------------------------------------------------
# Build settings
# ---------------------------------------------------------------------------
PRODUCTS_PER_PAGE = 48          # products on each category / machine page
RELATED_LIMIT = 8               # "related parts" shown on a product page
MAX_SITE_FILES = 19_000         # Cloudflare Pages free limit is 20,000 files

# Brand colours (60-30-10 rule), for reference. The website itself takes
# its colours from the @theme block in src/styles/global.css; change both.
COLORS = {
    "ink": "#1A1A1A",
    "bg": "#F5F5F4",
    "accent": "#FF6F00",
    "accent_text": "#C2410C",
}
