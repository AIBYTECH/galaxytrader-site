/**
 * Small plain-JavaScript helpers loaded on every page (no React needed):
 *
 *  1. Reveal-on-scroll: sections marked [data-reveal] fade in once.
 *  2. Spotlight: cards with class .spot get --mx/--my under the pointer.
 *  3. WhatsApp click counter: links with [data-wa-click] send a beacon to
 *     /api/click (functions/api/click.js), which logs SKU + button to D1.
 *
 * Astro bundles this file into /_astro/*.js (never inline), so it works
 * with the strict Content-Security-Policy in _headers.
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// 1. Reveal sections once when they scroll into view
// ---------------------------------------------------------------------------
function initReveal(): void {
  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (reduceMotion || !items.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target); // once only
        }
      }
    },
    { rootMargin: "0px 0px -40px 0px" },
  );

  // Things already on screen stay visible (no flash); only the rest wait.
  const fold = window.innerHeight;
  items.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) el.classList.add("is-in");
    else observer.observe(el);
  });
  document.documentElement.classList.add("js-reveal");
}

// ---------------------------------------------------------------------------
// 2. Spotlight that follows the pointer on .spot cards (desktop only)
// ---------------------------------------------------------------------------
function initSpotlight(): void {
  if (reduceMotion || !window.matchMedia("(hover: hover)").matches) return;
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as Element).closest?.<HTMLElement>(".spot");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

// ---------------------------------------------------------------------------
// 3. Count WhatsApp clicks (never blocks or delays the visitor)
// ---------------------------------------------------------------------------
function initClickLog(): void {
  document.addEventListener("click", (e) => {
    const link = (e.target as Element).closest?.<HTMLElement>("[data-wa-click]");
    if (!link || location.protocol === "file:") return;
    const body = JSON.stringify({ sku: link.dataset.sku ?? "", src: link.dataset.waClick });
    try {
      navigator.sendBeacon("/api/click", new Blob([body], { type: "application/json" }));
    } catch {
      /* logging is optional */
    }
  });
}

// ---------------------------------------------------------------------------
// 4. Photo morph into the product page (View Transitions)
// ---------------------------------------------------------------------------
// Only the clicked card's photo gets a view-transition-name, so the browser
// captures one image instead of 48. The product page photo has the same
// name ("product-photo"), so the thumbnail grows into it.
function initPhotoMorph(): void {
  document.addEventListener("click", (e) => {
    const link = (e.target as Element).closest?.("a");
    const card = link?.closest(".spot");
    const img = card?.querySelector<HTMLElement>("[data-vt-photo]");
    if (!img || reduceMotion) return;
    document.querySelectorAll<HTMLElement>("[data-vt-photo]").forEach((el) => (el.style.viewTransitionName = ""));
    img.style.viewTransitionName = "product-photo";
  });
  // Coming back with the Back button: clear the name so it isn't reused.
  window.addEventListener("pageshow", () => {
    document.querySelectorAll<HTMLElement>("[data-vt-photo]").forEach((el) => (el.style.viewTransitionName = ""));
  });
}

initReveal();
initSpotlight();
initClickLog();
initPhotoMorph();
