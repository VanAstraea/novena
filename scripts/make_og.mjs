// Renders the link-preview image (public/og-image.png, 1200x630) and the home-screen icon (public/apple-touch-icon.png,
// 180x180) from Novena's own emblem, fonts and drawn nave: no game art. Needs the dev server: npm run dev, then
// node scripts/make_og.mjs
import { chromium } from "@playwright/test";

const U = "http://localhost:5174";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(U + "/", { waitUntil: "domcontentloaded" }); // same origin, so the site's fonts and images load
await p.setContent(`<!doctype html><html><head><base href="${U}/"><style>
  @font-face { font-family: "Cinzel"; src: url("/fonts/cinzel-400-900-latin.woff2") format("woff2"); font-weight: 400 900; }
  @font-face { font-family: "Cormorant Garamond"; src: url("/fonts/cormorant-garamond-500-italic-latin.woff2") format("woff2"); font-style: italic; font-weight: 500; }
  @font-face { font-family: "Alegreya Sans"; src: url("/fonts/alegreya-sans-500-latin.woff2") format("woff2"); font-weight: 500; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0d0c0b; }
  .bg { position: absolute; inset: 0; background: url("/bg/nave.svg") 62% 45% / cover; opacity: 0.9; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, #0d0c0b 30%, rgba(13,12,11,0.55) 62%, rgba(13,12,11,0.15)); }
  .copy { position: absolute; left: 86px; top: 50%; transform: translateY(-50%); color: #f6f1e8; }
  .crest { width: 120px; height: 120px; margin: 0 0 10px -8px; filter: drop-shadow(0 0 14px rgba(242,213,153,0.45)); }
  .eyebrow { font: 500 22px "Alegreya Sans"; letter-spacing: 0.42em; text-transform: uppercase; color: #dfb768; margin: 0 0 6px; }
  h1 { font: 600 132px/0.9 "Cinzel"; letter-spacing: 0.05em; margin: 0; text-shadow: 0 0 48px rgba(242,213,153,0.22); }
  .tag { font: italic 500 40px "Cormorant Garamond"; color: #f2d599; margin: 16px 0 0; }
  .lede { font: 500 26px/1.4 "Alegreya Sans"; color: #cfc6b8; margin: 22px 0 0; max-width: 620px; border-left: 2px solid #c99c50; padding-left: 18px; }
  .rule { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: linear-gradient(90deg, transparent, #c99c50 30%, #f2d599 50%, #c99c50 70%, transparent); opacity: 0.8; }
</style></head><body><div class="bg"></div><div class="shade"></div>
<div class="copy"><img class="crest" src="/novena-crest.svg"><p class="eyebrow">An Arknights companion</p><h1>NOVENA</h1><p class="tag">Ora et labora</p>
<p class="lede">Plan upgrades, compare operators and farm smarter. Free, open source; no sign-up, no tracking.</p></div><div class="rule"></div></body></html>`);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
await p.screenshot({ path: "public/og-image.png" });

const i = await b.newPage({ viewport: { width: 180, height: 180 } });
await i.goto(U + "/", { waitUntil: "domcontentloaded" });
await i.setContent(`<!doctype html><html><head><base href="${U}/"></head><body style="margin:0;background:transparent">
  <div style="width:180px;height:180px;background:radial-gradient(circle at 50% 40%,#2a2119,#0d0c0b 75%);display:grid;place-items:center">
  <img src="/novena-mark.svg" style="width:128px;height:128px;filter:drop-shadow(0 0 8px rgba(242,213,153,0.35))"></div></body></html>`);
await i.waitForTimeout(500);
await i.screenshot({ path: "public/apple-touch-icon.png" }); // iOS rounds the corners itself
await b.close();
console.log("wrote public/og-image.png and public/apple-touch-icon.png");
