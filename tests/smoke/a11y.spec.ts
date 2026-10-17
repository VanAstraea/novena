import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility check of every page (axe-core, WCAG 2.1 A and AA): the light theme at phone width and the dark theme
// at desktop width, so both themes' colours and both layouts are covered once.
const PAGES = ["/", "/operators", "/operator/char_202_demkni", "/operator/char_202_demkni?tab=skills", "/compare?ops=char_202_demkni,char_1028_texas2",
  "/planner?t=char_202_demkni:E2%20L90%20S2M3", "/farming?items=30073:5", "/recruit?tags=11,3,15", "/rankings", "/tiers", "/upcoming", "/is",
  "/enemies", "/enemies?stage=1-7", "/enemy/enemy_1501_demonk", "/today", "/roster", "/plan", "/plan?view=archetypes", "/dump", "/base", "/pulls",
  "/guide", "/story", "/story?view=main&edit=1", "/settings", "/about", "/credits"];

for (const path of PAGES) {
  test(`${path} has no accessibility violations`, async ({ page }, info) => {
    const scheme = info.project.name === "phone" ? "light" : "dark";
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto(path);
    await page.locator("main h1").first().waitFor();
    await page.waitForTimeout(1200); // data-driven parts render after the heading
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const found = r.violations.map((v) => `${v.id} (${v.impact}, ${scheme}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(found, found.join("\n")).toEqual([]);
  });
}
