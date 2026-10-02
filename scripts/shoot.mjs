// Full-resolution screenshots of the dev server for design review (not part of the test suite).
import { chromium } from "@playwright/test";
const [, , ...pages] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || "dark" });
const page = await ctx.newPage();
for (const p of pages) {
  const [path, name, full] = p.split("|");
  await page.goto("http://localhost:5174" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `.cache/shots/${name}.png`, fullPage: full === "full" });
  console.log("shot", name);
}
await browser.close();
