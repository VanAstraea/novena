// Renders the installed-app icons (public/icons/) from Novena's own mark, the same way make_og.mjs draws the
// home-screen icon: the gold-and-ivory star on the dark nave colour, screenshotted with Playwright's Chromium.
//   icon-192.png, icon-512.png    rounded square, for desktops and launchers that show the icon as it is
//   maskable-192.png, maskable-512.png    full bleed with the mark inside the middle 80%, for Android's shaped icons
// No dev server needed: node scripts/make_icons.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const mark = `data:image/svg+xml;base64,${readFileSync("public/novena-mark.svg").toString("base64")}`;
const BG = "radial-gradient(circle at 50% 40%,#2a2119,#0d0c0b 75%)"; // as on the apple-touch-icon

const icon = (size, maskable) => {
  const markSize = Math.round(size * (maskable ? 0.56 : 0.7)); // maskable: Android may crop to a circle 80% wide
  const radius = maskable ? 0 : Math.round(size * 0.22);
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${BG};display:grid;place-items:center">
    <img src="${mark}" style="width:${markSize}px;height:${markSize}px;filter:drop-shadow(0 0 ${Math.round(size / 22)}px rgba(242,213,153,0.35))">
    </div></body></html>`;
};

mkdirSync("public/icons", { recursive: true });
const b = await chromium.launch();
for (const size of [192, 512]) {
  for (const maskable of [false, true]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(icon(size, maskable));
    await p.waitForTimeout(300);
    const path = `public/icons/${maskable ? "maskable" : "icon"}-${size}.png`;
    await p.screenshot({ path, omitBackground: true });
    await p.close();
    console.log(`wrote ${path}`);
  }
}
await b.close();
