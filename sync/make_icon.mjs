// Renders the Novena mark to the app icon (sync/assets/novena.png; make_icon.py turns it into .ico/.icns sizes).
// Run from the repo root: node sync/make_icon.mjs && sync/.venv/Scripts/python sync/make_icon.py
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const svg = readFileSync("public/novena-mark.svg", "utf8");
mkdirSync("sync/assets", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
// The mark on a navy rounded tile, so it reads on light and dark taskbars alike.
await p.setContent(`<html><body style="margin:0;background:transparent">
  <div style="width:1024px;height:1024px;border-radius:200px;background:radial-gradient(circle at 50% 40%,#16223f,#06080f 75%);display:grid;place-items:center">
    <div style="width:760px;height:760px">${svg.replace("<svg ", '<svg width="760" height="760" ')}</div>
  </div></body></html>`);
await p.screenshot({ path: "sync/assets/novena.png", omitBackground: true });
await b.close();
console.log("wrote sync/assets/novena.png");
