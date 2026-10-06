// README and announcement screenshots, taken with the made-up sample roster (never a real account).
// Needs the dev server (npm run dev); writes docs/screenshots/*.png (the README uses JPEG copies of them).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const U = "http://localhost:5174";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
const p = await ctx.newPage();
const settle = async (ms = 1500) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(ms); };
const hideBanners = () => p.addStyleTag({ content: ".sample-banner, .get-started, .toasts { display: none !important; }" });

// home: wait for Lemuen
await p.goto(U + "/?intro=0"); await p.locator(".hero-art.loaded").waitFor({ timeout: 120000 }); await settle(2500);
await p.screenshot({ path: `${OUT}/home.png` });

// the sample roster, then let the priorities build
await p.click("text=Try it with a sample roster"); await settle();
await p.goto(U + "/plan"); await p.locator("main table tbody tr").first().waitFor({ timeout: 120000 }); await settle(2500);
await hideBanners(); await p.evaluate(() => scrollTo(0, 0)); await settle(500);
await p.screenshot({ path: `${OUT}/priorities.png` });

await p.goto(U + "/roster"); await settle(2500); await hideBanners();
await p.screenshot({ path: `${OUT}/roster.png` });

await p.goto(U + "/today"); await settle(2500); await hideBanners();
await p.screenshot({ path: `${OUT}/today.png` });

await p.goto(U + "/compare?ops=char_4193_lemuen,char_213_mostma,char_332_archet"); await settle(3000); await hideBanners();
await p.screenshot({ path: `${OUT}/compare.png` });

await p.goto(U + "/upcoming"); await settle(2500); await hideBanners();
await p.screenshot({ path: `${OUT}/upcoming.png` });

// a phone
const ph = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" })).newPage();
await ph.goto(U + "/?intro=0"); await ph.locator(".hero-art.loaded").waitFor({ timeout: 120000 }).catch(() => {}); await ph.waitForTimeout(2500);
await ph.screenshot({ path: `${OUT}/phone.png` });
await b.close();
console.log("done");
