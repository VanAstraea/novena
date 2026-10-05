// Records the design previews in docs/design/previews (dev-only, not part of the test suite).
//   node scripts/preview-record.mjs frames   key frames of the intro + a contact sheet
//   node scripts/preview-record.mjs video    intro and card-to-page videos (mp4 + gif)
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const OUT = resolve(".cache/previews");
const page = (name, q = "") => pathToFileURL(resolve("docs/design/previews", name)).href + q;
const size = { width: 1440, height: 900 };
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] || "frames";
const browser = await chromium.launch();

if (mode === "frames") {
  const times = (process.argv[3] || "900,1720,2200,3600,4000,4400,4850,5150,5800,7000").split(",").map(Number);
  const p = await (await browser.newContext({ viewport: size })).newPage();
  await p.goto(page("intro.html", "?clean&hold"));
  await p.evaluate(() => window.__ready);
  for (const [i, t] of times.entries()) {
    await p.evaluate((t) => window.__seek(t), t);
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/f${String(i).padStart(2, "0")}_${t}.png` });
  }
  // Contact sheet: lay the frames out in a page and screenshot it.
  const cells = times.map((t, i) => `<figure><img src="${pathToFileURL(`${OUT}/f${String(i).padStart(2, "0")}_${t}.png`).href}"><figcaption>${(t / 1000).toFixed(1)} s</figcaption></figure>`).join("");
  const sheet = await (await browser.newContext({ viewport: { width: 2440, height: 640 } })).newPage();
  writeFileSync(`${OUT}/sheet.html`, `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(5,480px);gap:8px;padding:8px}figure{margin:0;position:relative}img{width:480px;display:block}figcaption{position:absolute;left:8px;top:6px;padding:2px 8px;background:#000a;color:#fff;font:600 15px system-ui}</style>${cells}`);
  await sheet.goto(pathToFileURL(`${OUT}/sheet.html`).href);
  await sheet.screenshot({ path: `${OUT}/intro-contact-sheet.png`, fullPage: true });
  console.log("frames + contact sheet in", OUT);
}

const encode = (base) => ff("-i", `${base}.mp4`, "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a", `${base}.gif`);

if (mode === "video") {
  // Intro: step the timeline frame by frame, so the video is exact and never drops frames.
  const fps = 30, dir = `${OUT}/steps`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const p = await (await browser.newContext({ viewport: size })).newPage();
  await p.goto(page("intro.html", "?clean&hold"));
  await p.evaluate(() => window.__ready);
  const T = await p.evaluate(() => window.__T), n = Math.round(((T + 1200) / 1000) * fps);
  for (let i = 0; i <= n; i++) {
    await p.evaluate((t) => window.__step(t), Math.min(T, (i * 1000) / fps) + Math.max(0, (i * 1000) / fps - T));
    await p.screenshot({ path: `${dir}/${String(i).padStart(4, "0")}.png` });
  }
  ff("-framerate", String(fps), "-i", `${dir}/%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", `${OUT}/intro.mp4`);
  encode(`${OUT}/intro`);
  console.log("recorded intro");

  // Card to page: hold the View Transition's animations and step them too.
  const tdir = `${OUT}/tsteps`;
  rmSync(tdir, { recursive: true, force: true });
  mkdirSync(tdir);
  const q = await (await browser.newContext({ viewport: size })).newPage();
  await q.goto(page("transition.html", "?step"));
  await q.evaluate(() => window.__ready);
  let k = 0;
  const shot = () => q.screenshot({ path: `${tdir}/${String(k++).padStart(4, "0")}.png` });
  const hold = async (ms) => { for (let i = 0; i < (ms / 1000) * fps; i++) await shot(); };
  const run = async (start) => {
    await q.evaluate(start);
    for (let t = 0; t <= 1200; t += 1000 / fps) { await q.evaluate((t) => window.__vtSeek(t), t); await shot(); }
    await q.evaluate(() => window.__vtEnd());
  };
  await hold(700);
  await run(() => window.__open(0));
  await hold(1800);
  await run(() => window.__back());
  await hold(900);
  ff("-framerate", String(fps), "-i", `${tdir}/%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", `${OUT}/transition.mp4`);
  encode(`${OUT}/transition`);
  console.log("recorded transition");
}
await browser.close();
