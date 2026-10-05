import { expect, test } from "@playwright/test";

const PAGES: [string, RegExp][] = [
  ["/", /Novena/i],
  ["/operators", /Operators/],
  ["/operator/char_202_demkni", /Saria/],
  ["/operator/char_202_demkni?tab=skills", /Saria/],
  ["/compare?ops=char_202_demkni,char_1028_texas2", /Compare operators/],
  ["/planner?t=char_202_demkni:E2%20L90%20S2M3", /Upgrade planner/],
  ["/farming?items=30073:5", /Farming planner/],
  ["/recruit?tags=11,3,15", /Recruitment calculator/],
  ["/rankings", /Rankings/],
  ["/upcoming", /Upcoming content/],
  ["/is", /Integrated Strategies/],
  ["/today", /Today/],
  ["/roster", /My roster/],
  ["/plan", /Priorities/],
  ["/dump", /Sanity Dump/],
  ["/base", /Base/],
  ["/pulls", /Pull planner/],
  ["/settings", /Settings/],
  ["/about", /About/],
  ["/credits", /Credits/],
];

// Images come from a third-party mirror; a missing one isn't a site error.
const ignorable = (text: string) => /Failed to load resource.*(githubusercontent|404)/i.test(text) || /ERR_(NAME|INTERNET|CONNECTION)/.test(text);

for (const [path, heading] of PAGES) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !ignorable(m.text())) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator("main h1").first()).toHaveText(heading);
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no sideways page scroll").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("skills tab shows every skill", async ({ page }) => {
  await page.goto("/operator/char_202_demkni?tab=skills");
  await expect(page.getByRole("heading", { name: /S3 · Calcification/ })).toBeVisible();
});

test("search finds an operator with Ctrl+K", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search" }).fill("saria");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/operator\/char_202_demkni/);
});

test("farming plan solves in the browser", async ({ page }) => {
  await page.goto("/farming?items=30073:5,30083:3");
  await page.getByRole("button", { name: "Plan the farming" }).click();
  await expect(page.getByRole("heading", { name: /Plan: [\d,]+ sanity/ })).toBeVisible({ timeout: 15_000 });
});

test("roster survives a reload", async ({ page }) => {
  await page.goto("/roster");
  await page.getByRole("combobox", { name: /Add an operator/ }).fill("Myrtle");
  await expect(page.getByRole("option", { name: /Myrtle/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("cell", { name: /Myrtle/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: /Myrtle/ }).first()).toBeVisible();
});

const DEPOT_SHOT = ".cache/dr/cases/us_simulator_0/image.png";

test("depot screenshot import reads every item", async ({ page }) => {
  const { existsSync, readFileSync } = await import("node:fs");
  test.skip(!existsSync(DEPOT_SHOT), "run scripts/depot_fixtures.py for the test screenshot");
  await page.goto("/roster?tab=depot");
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: "depot.png", mimeType: "image/png", buffer: readFileSync(DEPOT_SHOT) });
  await expect(page.getByText(/Found 24 items/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Update 24 items in my depot/ }).click();
  await expect(page.getByLabel("Orirock Cube held")).toHaveValue("17");
});
