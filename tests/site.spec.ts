/**
 * Feature tests for the catalogue, run on a phone (390 px) and a desktop
 * (1366 px), against the real Yao Han catalogue. The parts used are picked
 * from the built data (src/data/*.json), so the tests keep working when the
 * workbook changes:
 *   ddl      a part for the Juki DDL-9000 (machine page, search, reorder list)
 *   other    a second part with a photo (reorder list)
 *   noPhoto  a part without a photo ("Photo coming soon")
 *   km       a cutter part with a KM number as alias (alias search)
 */
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

type P = { sku: string; name: string; url: string; machineIds: string[]; aliases: string[]; hasPhoto: boolean;
  specs: [string, string][]; subcategoryId: string; status: string };
type C = { id: string; name: string; parentId: string; children: string[]; count: number; skus: string[] };
const products = JSON.parse(readFileSync("src/data/products.json", "utf8")) as P[];
const categories = JSON.parse(readFileSync("src/data/categories.json", "utf8")) as C[];

const DDL = "juki-ddl-9000";
const ddl = products.find((p) => p.machineIds.includes(DDL) && p.hasPhoto && p.specs.length > 0)
  ?? products.find((p) => p.machineIds.includes(DDL) && p.hasPhoto)!;
const other = products.find((p) => p.hasPhoto && p.subcategoryId === ddl.subcategoryId && p.sku !== ddl.sku)!;
const noPhoto = products.find((p) => !p.hasPhoto)!;
const km = products.find((p) => p.aliases.some((a) => /^U-\d{3}$/.test(a)))!;
const juki = categories.find((c) => c.id === "juki")!;
const brandMain = categories.find((c) => c.id === "parts-by-brand")!;
const slugUrl = (p: P) => `/p/${p.sku.toLowerCase()}/`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fail the test on any console error (this also catches CSP violations). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Wait until Astro has hydrated every island on the page. client:visible
 * islands only wake up when on screen, so scroll each one into view first.
 */
async function hydrated(page: Page) {
  await page.waitForLoadState("load");
  const count = await page.locator("astro-island").count();
  for (let i = 0; i < count; i++) {
    const island = page.locator("astro-island").nth(i);
    await island.evaluate((el) => (el.firstElementChild ?? el.parentElement)?.scrollIntoView({ block: "center" }));
    // Give the IntersectionObserver a frame to see it, then wait for hydration.
    await expect(island).not.toHaveAttribute("ssr", { timeout: 20_000 });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("test data was found in the catalogue", () => {
  expect(ddl, "a Juki DDL-9000 part with a photo").toBeTruthy();
  expect(other, "a second part with a photo").toBeTruthy();
  expect(noPhoto, "a part without a photo").toBeTruthy();
  expect(km, "a part with a KM number").toBeTruthy();
});

// ---------------------------------------------------------------------------
test("pages load with the strict CSP and no console errors", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  for (const url of ["/", "/c/parts-by-brand/", "/c/juki/", slugUrl(ddl), slugUrl(noPhoto), `/m/${DDL}/`,
    "/machines/", "/search/?q=DDL-9000", "/list/", "/about/", "/contact/", "/privacy/"]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(200);
    expect(res?.headers()["content-security-policy"], url).toContain("script-src 'self'");
    await page.mouse.wheel(0, 4000); // trigger scroll reveals + client:visible islands
    await hydrated(page);
  }
  expect(errors).toEqual([]);
});

test("unknown URL shows the 404 page", async ({ page }) => {
  const res = await page.goto("/p/does-not-exist/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("SEO files and structured data", async ({ page, request }) => {
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`${slugUrl(ddl)}</loc>`);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /list/");
  await page.goto("/");
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join()).toContain('"Organization"');
  await page.goto(slugUrl(ddl));
  const pld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join();
  expect(pld).toContain('"BreadcrumbList"');
  expect(pld).not.toContain('"Product"'); // no prices/offers, so no Product schema
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
test.describe("categories", () => {
  test("menu shows the 5 main categories", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("navigation", { name: "Categories" });
    await expect(menu.getByRole("link")).toHaveCount(6); // 5 + "Shop by machine"
    await expect(menu.getByRole("link", { name: "Sewing Machine Parts by Brand" })).toBeVisible();
  });

  test("main category page shows subcategory tiles with counts", async ({ page }) => {
    await page.goto("/c/parts-by-brand/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(brandMain.name);
    const tile = page.getByRole("link", { name: new RegExp(`^${juki.name}\\s+${juki.count.toLocaleString("en-US")} parts$`) });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page).toHaveURL(/\/c\/juki\/$/);
    await expect(page.locator("article[data-sku]")).toHaveCount(48);
  });
});

// ---------------------------------------------------------------------------
test.describe("search", () => {
  for (const [query, sku] of [
    [ddl.sku, ddl.sku],
    [ddl.sku.replace(/-/g, "").toLowerCase(), ddl.sku], // dashes and capitals ignored
    [km.aliases.find((a) => /^U-\d{3}$/.test(a))!, km.sku], // KM number (alias)
  ]) {
    test(`"${query}" finds ${sku}`, async ({ page }) => {
      await page.goto("/");
      await hydrated(page);
      await page.getByRole("combobox", { name: "Search parts" }).fill(query);
      await expect(page.getByRole("listbox").getByRole("option", { name: new RegExp(esc(sku)) }).first()).toBeVisible();
    });
  }

  test("keyboard: arrows + Enter open a result, Esc closes", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const box = page.getByRole("combobox", { name: "Search parts" });
    await box.fill(ddl.sku);
    await expect(page.getByRole("listbox")).toBeVisible();
    await box.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await box.fill(ddl.sku);
    await expect(page.getByRole("listbox")).toBeVisible();
    await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-activedescendant", /opt-0/);
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${esc(slugUrl(ddl))}$`));
  });

  test("search page lists DDL-9000 parts", async ({ page }) => {
    await page.goto("/search/?q=DDL-9000");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “DDL-9000”");
    await expect(page.getByText(/parts? found/)).toBeVisible();
    expect(await page.locator("article[data-sku]").count()).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
test("machine picker: brand -> model -> machine page", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByLabel("Machine brand", { exact: true }).selectOption("Juki");
  await page.getByLabel("Juki model").selectOption(DDL);
  await page.getByRole("button", { name: /Show \d+ parts for DDL-9000/ }).click();
  await expect(page).toHaveURL(new RegExp(`/m/${DDL}/$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Juki DDL-9000");
});

test("category filters: machine model", async ({ page }) => {
  await page.goto("/c/juki/");
  await hydrated(page);
  await page.getByLabel("Machine model").selectOption(DDL);
  const n = products.filter((p) => p.subcategoryId === "juki" && p.machineIds.includes(DDL)).length;
  await expect(page.getByLabel("Filter parts").getByText(/parts?$/).last()).toHaveText(`${n} parts`);
  await expect(page.locator("article[data-sku]").first()).toBeVisible();
});

test("part numbers with / and . get a clean URL and are found by search", async ({ page }) => {
  const slash = products.find((p) => p.sku.includes("/") && p.hasPhoto)!;
  const dot = products.find((p) => p.sku.includes("."))!;
  for (const p of [slash, dot]) {
    expect(p.url).toBe(`/p/${p.sku.toLowerCase().replace(/[/.]/g, "-")}/`);
    const res = await page.goto(p.url);
    expect(res?.status(), p.sku).toBe(200);
    await expect(page.getByText(p.sku, { exact: true }).first()).toBeVisible();
  }
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("combobox", { name: "Search parts" }).fill(slash.sku);
  const option = page.getByRole("listbox").getByRole("option", { name: new RegExp(esc(slash.sku)) }).first();
  await expect(option).toBeVisible();
  await expect(option.locator("img")).toHaveAttribute("src", new RegExp(`${esc(slash.url.slice(3, -1))}-300\\.webp$`));
});

test("part without a photo shows 'Photo coming soon'", async ({ page }) => {
  await page.goto(slugUrl(noPhoto));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('img[src="/img/photo-coming-soon.svg"]').first()).toBeVisible();
  // the part's own picture (the first one on the page) is the placeholder
  await expect(page.locator("main img").first()).toHaveAttribute("src", "/img/photo-coming-soon.svg");
});

// ---------------------------------------------------------------------------
test("reorder list: add, change qty, note, remove, send links, clear", async ({ page }) => {
  // From a card
  await page.goto(`/m/${DDL}/`);
  await hydrated(page);
  const card = page.locator("article[data-sku]").first();
  const cardSku = (await card.getAttribute("data-sku"))!;
  await card.getByRole("button", { name: "+ Reorder list" }).click();
  await expect(card.getByRole("button", { name: "✓ In your list" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `${cardSku} saved` })).toBeVisible();
  await expect(page.getByLabel(/in your list$/)).toHaveText("1");

  // From the product page with a custom quantity
  const prod = cardSku === other.sku ? ddl : other;
  await page.goto(slugUrl(prod));
  await hydrated(page);
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Add to reorder list" }).click();
  await expect(page.getByRole("button", { name: "Added to your list" })).toBeVisible();
  await expect(page.getByLabel(/in your list$/)).toHaveText("2");

  // The list page
  await page.goto("/list/");
  await hydrated(page);
  await expect(page.getByText("2 parts in your list")).toBeVisible();
  await expect(page.getByLabel(`Quantity for ${prod.sku}`)).toHaveValue("2");
  await page.getByLabel(`Quantity for ${prod.sku}`).fill("25");
  await page.getByLabel("Note for us (optional)").fill("Ali Garments, Faisalabad");
  const wa = decodeURIComponent((await page.getByRole("link", { name: "Send list on WhatsApp" }).getAttribute("href"))!);
  expect(wa).toContain("https://wa.me/");
  expect(wa).toContain(`${prod.sku} - ${prod.name} x 25`);
  expect(wa).toContain("Note: Ali Garments, Faisalabad");
  const mail = decodeURIComponent((await page.getByRole("link", { name: "Send by email" }).getAttribute("href"))!);
  expect(mail).toMatch(/^mailto:.*subject=Reorder list/);
  expect(mail).toContain(cardSku);

  await page.getByRole("button", { name: `Remove ${cardSku}` }).click();
  await expect(page.getByText("1 part in your list")).toBeVisible();
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel(`Quantity for ${prod.sku}`)).toHaveValue("25"); // saved
  await page.getByRole("button", { name: "Clear list" }).click();
  await page.getByRole("button", { name: "Yes, clear list" }).click();
  await expect(page.getByText("Your list is empty")).toBeVisible();
});

test("recently viewed parts appear on the home page", async ({ page }) => {
  await page.goto(slugUrl(other));
  await hydrated(page);
  await page.goto(slugUrl(ddl));
  await hydrated(page);
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recently viewed" });
  await expect(recent.getByRole("link")).toHaveCount(2);
  await expect(recent.getByRole("link").first()).toContainText(ddl.sku);
});

test("WhatsApp link is pre-filled and the click is logged", async ({ page, request }) => {
  await page.goto(slugUrl(ddl));
  await hydrated(page);
  const link = page.getByRole("link", { name: "Ask on WhatsApp" });
  const href = decodeURIComponent((await link.getAttribute("href"))!);
  expect(href).toContain(`${ddl.sku} - ${ddl.name}`);
  expect(href).toContain(slugUrl(ddl));
  // Don't actually leave for wa.me: block it, then check the beacon arrived.
  await page.route("https://wa.me/**", (r) => r.abort());
  await link.click();
  // The row also records which site the click came from (the host name),
  // so the monthly report can leave out staging and preview clicks.
  type Click = { sku: string; src: string; host: string };
  await expect
    .poll(async () => ((await (await request.get("/__clicks")).json()) as Click[]).find((c) => c.sku === ddl.sku))
    .toMatchObject({ sku: ddl.sku, src: "product", host: "localhost" });
});

test("share button copies the link when Web Share is unavailable", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(slugUrl(ddl));
  await hydrated(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await page.getByRole("button", { name: "Share this part" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
});

// ---------------------------------------------------------------------------
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("content is readable", async ({ page }) => {
    await page.goto(slugUrl(ddl));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ddl.name);
    await expect(page.getByRole("link", { name: "Ask on WhatsApp" })).toBeVisible();
    await page.goto("/c/juki/");
    expect(await page.locator("article[data-sku]").count()).toBe(48);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "How to reorder" })).toBeVisible();
    await expect(page.locator("h1")).toHaveText(/Find and reorder your sewing machine parts/);
    await expect(page.locator("dl dd").first()).toHaveText(products.length.toLocaleString("en-US")); // real count, not 0
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing animates", async ({ page }) => {
    await page.goto("/");
    const anim = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName);
    expect(await anim("h1 span")).toBe("none");
    expect(await anim(".marquee-copy")).toBe("none");
    await expect(page.locator('.marquee-copy[data-copy="1"]')).toBeHidden();
    await expect(page.getByRole("heading", { name: "How to reorder" })).toBeVisible(); // no hidden reveal state
  });
});

test("marquee pauses on hover", async ({ page, isMobile }) => {
  test.skip(isMobile, "no hover on phones");
  await page.goto("/");
  const copy = page.locator(".marquee-copy").first();
  expect(await copy.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("running");
  await page.locator(".marquee").hover();
  expect(await copy.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
});
