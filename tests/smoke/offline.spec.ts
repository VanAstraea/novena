import { expect, test } from "@playwright/test";

// Installable and offline: the manifest and its icons, then the service worker serving pages and data once the
// connection is gone.
test.use({ serviceWorkers: "allow" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "once is enough"));

test("manifest is installable", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Novena", short_name: "Novena", display: "standalone", start_url: "./", scope: "./" });
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  for (const purpose of ["any", "maskable"]) {
    expect(m.icons.some((i: { purpose: string; sizes: string }) => i.purpose === purpose && i.sizes === "512x512")).toBe(true);
  }
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href!, "http://localhost:4173/")).href);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("pages and data work offline once loaded", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === "activated" && !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
  // online first: open some pages so their data is cached, and run the solver once so it's kept
  for (const path of ["/operators", "/operator/char_202_demkni", "/today"]) {
    await page.goto(path);
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/farming?items=30073:5");
  await page.getByRole("button", { name: "Plan the farming" }).click();
  await expect(page.getByRole("heading", { name: /Plan: [\d,]+ sanity/ })).toBeVisible({ timeout: 15_000 });

  const cached = await page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const shell = Object.keys(cached).find((n) => n.startsWith("novena-shell-"))!;
  expect(cached[shell]).toContain("/index.html");
  expect(cached[shell].some((p) => /^\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(cached["novena-data-v1"]).toContain("/data/v1/en/operators.json");
  expect(cached["novena-assets"].some((p) => p.endsWith(".wasm"))).toBe(true);

  await context.setOffline(true);
  // really offline, for the worker too: data never opened isn't there
  expect(await page.evaluate(() => fetch("/data/v1/jp/operators.json").then((r) => r.ok, () => false))).toBe(false);
  const offline: [string, RegExp][] = [
    ["/", /Novena/i],
    ["/operators", /Operators/],
    ["/operator/char_202_demkni", /Saria/],
    ["/today", /Today/],
    ["/settings", /Settings/],
  ];
  for (const [path, heading] of offline) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toHaveText(heading);
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
  }
  await expect(page.locator("main")).toContainText("Available offline");
  await page.goto("/operators");
  await expect(page.locator('main a[href*="/operator/char_"]').first()).toBeVisible(); // the cached operator list
  await page.goto("/farming?items=30073:5");
  await page.getByRole("button", { name: "Plan the farming" }).click();
  await expect(page.getByRole("heading", { name: /Plan: [\d,]+ sanity/ })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});
