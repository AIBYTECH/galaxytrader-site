/**
 * Feature tests for the catalogue, run on a phone (390 px) and a desktop
 * (1366 px). They use the sample workbook from make_sample_data.py:
 *   GT-10021 "Large rotary hook" (alias "kanda", fits Juki DDL-8700, MOQ 10)
 *   GT-10115 bobbin case, GT-60015 is discontinued.
 */
import { test, expect, type Page } from "@playwright/test";

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

// ---------------------------------------------------------------------------
test("pages load with the strict CSP and no console errors", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  for (const url of ["/", "/c/hooks-bobbins/", "/p/gt-10021/", "/m/juki-ddl8700/", "/machines/", "/search/?q=hook", "/list/", "/about/", "/contact/", "/privacy/"]) {
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
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/p/gt-10021/</loc>");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /list/");
  await page.goto("/");
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join()).toContain('"Organization"');
  await page.goto("/p/gt-10021/");
  const pld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join();
  expect(pld).toContain('"BreadcrumbList"');
  expect(pld).not.toContain('"Product"'); // no prices/offers, so no Product schema
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
test.describe("search", () => {
  for (const [query, sku] of [
    ["ddl8700", "GT-10021"],
    ["DDL-8700", "GT-10021"],
    ["gt10115", "GT-10115"],
    ["GT-1O115", "GT-10115"], // letter O typed instead of zero
    ["kanda", "GT-10021"], // local alias
  ]) {
    test(`"${query}" finds ${sku}`, async ({ page }) => {
      await page.goto("/");
      await hydrated(page);
      await page.getByRole("combobox", { name: "Search parts" }).fill(query);
      await expect(page.getByRole("listbox").getByRole("option", { name: new RegExp(sku) })).toBeVisible();
    });
  }

  test("keyboard: arrows + Enter open a result, Esc closes", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const box = page.getByRole("combobox", { name: "Search parts" });
    await box.fill("kanda");
    await expect(page.getByRole("listbox")).toBeVisible();
    await box.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await box.fill("kand");
    await expect(page.getByRole("listbox")).toBeVisible();
    await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-activedescendant", /opt-0/);
    await box.press("Enter");
    await expect(page).toHaveURL(/\/p\/gt-10021\/$/);
  });

  test("search page lists results", async ({ page }) => {
    await page.goto("/search/?q=bobbin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “bobbin”");
    await expect(page.getByText(/parts? found/)).toBeVisible();
    expect(await page.locator("article[data-sku]").count()).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
test("machine picker: brand -> model -> machine page", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByLabel("Machine brand", { exact: true }).selectOption("Juki");
  await page.getByLabel("Juki model").selectOption("juki-ddl8700");
  await page.getByRole("button", { name: /Show \d+ parts for DDL-8700/ }).click();
  await expect(page).toHaveURL(/\/m\/juki-ddl8700\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Juki DDL-8700");
});

test("category filters: brand, model and in stock only", async ({ page }) => {
  await page.goto("/c/hooks-bobbins/");
  await hydrated(page);
  const cards = page.locator("article[data-sku]");
  const all = await cards.count();
  await page.getByLabel("Machine brand").selectOption("Jack");
  await expect.poll(() => cards.count()).toBeLessThan(all);
  await expect(page.getByLabel("Filter parts").getByText(/parts?$/).last()).toHaveText(`${await cards.count()} parts`);
  await page.getByLabel("Machine brand").selectOption("");
  await page.getByLabel("In stock only").check();
  await expect(cards.filter({ hasText: "Ask for stock" })).toHaveCount(0);
  await page.getByLabel("Machine model").selectOption({ label: "DDL-8700" });
  await expect(cards.first()).toBeVisible();
});

// ---------------------------------------------------------------------------
test("reorder list: add, change qty, note, remove, send links, clear", async ({ page }) => {
  // From a card (uses the MOQ as quantity)
  await page.goto("/c/hooks-bobbins/");
  await hydrated(page);
  const card = page.locator('article[data-sku="GT-10024"]');
  await card.getByRole("button", { name: "+ Reorder list" }).click();
  await expect(card.getByRole("button", { name: "✓ In your list" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "GT-10024 saved" })).toBeVisible();
  await expect(page.getByLabel(/in your list$/)).toHaveText("1");

  // From the product page with a custom quantity
  await page.goto("/p/gt-10021/");
  await hydrated(page);
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Add to reorder list" }).click();
  await expect(page.getByRole("button", { name: "Added to your list" })).toBeVisible();
  await expect(page.getByLabel(/in your list$/)).toHaveText("2");

  // The list page
  await page.goto("/list/");
  await hydrated(page);
  await expect(page.getByText("2 parts in your list")).toBeVisible();
  await expect(page.getByLabel("Quantity for GT-10021")).toHaveValue("11");
  await page.getByLabel("Quantity for GT-10021").fill("25");
  await page.getByLabel("Note for us (optional)").fill("Ali Garments, Faisalabad");
  const wa = decodeURIComponent((await page.getByRole("link", { name: "Send list on WhatsApp" }).getAttribute("href"))!);
  expect(wa).toContain("https://wa.me/");
  expect(wa).toContain("GT-10021 - Large rotary hook x 25");
  expect(wa).toContain("Note: Ali Garments, Faisalabad");
  const mail = decodeURIComponent((await page.getByRole("link", { name: "Send by email" }).getAttribute("href"))!);
  expect(mail).toMatch(/^mailto:.*subject=Reorder list/);
  expect(mail).toContain("GT-10024");

  await page.getByRole("button", { name: "Remove GT-10024" }).click();
  await expect(page.getByText("1 part in your list")).toBeVisible();
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel("Quantity for GT-10021")).toHaveValue("25"); // saved
  await page.getByRole("button", { name: "Clear list" }).click();
  await page.getByRole("button", { name: "Yes, clear list" }).click();
  await expect(page.getByText("Your list is empty")).toBeVisible();
});

test("recently viewed parts appear on the home page", async ({ page }) => {
  await page.goto("/p/gt-10115/");
  await hydrated(page);
  await page.goto("/p/gt-10021/");
  await hydrated(page);
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recently viewed" });
  await expect(recent.getByRole("link")).toHaveCount(2);
  await expect(recent.getByRole("link").first()).toContainText("GT-10021");
});

test("WhatsApp link is pre-filled and the click is logged", async ({ page, request }) => {
  await page.goto("/p/gt-10021/");
  await hydrated(page);
  const link = page.getByRole("link", { name: "Ask on WhatsApp" });
  const href = decodeURIComponent((await link.getAttribute("href"))!);
  expect(href).toContain("GT-10021 - Large rotary hook");
  expect(href).toContain("/p/gt-10021/");
  // Don't actually leave for wa.me: block it, then check the beacon arrived.
  await page.route("https://wa.me/**", (r) => r.abort());
  await link.click();
  await expect
    .poll(async () => (await (await request.get("/__clicks")).json()).some((c: { sku: string }) => c.sku === "GT-10021"))
    .toBe(true);
});

test("discontinued part asks for an alternative", async ({ page }) => {
  await page.goto("/p/gt-60015/");
  await expect(page.getByText("Discontinued").first()).toBeVisible();
  const ask = page.getByRole("link", { name: "Ask for an alternative on WhatsApp" });
  expect(decodeURIComponent((await ask.getAttribute("href"))!)).toContain("Can you suggest an alternative?");
  await expect(page.getByRole("button", { name: "Add to reorder list" })).toHaveCount(0);
});

test("share button copies the link when Web Share is unavailable", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/p/gt-10021/");
  await hydrated(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await page.getByRole("button", { name: "Share this part" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
});

// ---------------------------------------------------------------------------
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("content is readable", async ({ page }) => {
    await page.goto("/p/gt-10021/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Large rotary hook");
    await expect(page.getByRole("link", { name: "Ask on WhatsApp" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Hardened steel" })).toBeVisible();
    await page.goto("/c/hooks-bobbins/");
    expect(await page.locator("article[data-sku]").count()).toBe(7);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "How to reorder" })).toBeVisible();
    await expect(page.locator("h1")).toHaveText(/Find and reorder your sewing machine parts/);
    await expect(page.locator("dl dd").first()).toHaveText("28"); // real count, not 0
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
