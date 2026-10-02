// Web Worker for depot screenshot recognition. Templates are built here, at runtime, from the community art mirror
// (each item's art on its rarity background, 183 px, as in the game), so no game art is hosted by this site.
// Screenshots arrive as bytes and never leave the browser.
import Jimp from "jimp";
import { prepareTemplate, recognizeDepot } from "./recognize";

const ART = "https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main";
const SIZE = 183;

export type InMsg =
  | { type: "init"; items: { id: string; icon: string; rarity: number }[]; order: string[] }
  | { type: "recognize"; key: string; image: ArrayBuffer };

let templates: Map<string, Jimp> | null = null;
let order: string[] = [];
const bitmaps = new Map<string, Promise<ImageBitmap | null>>();

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

function bitmap(url: string): Promise<ImageBitmap | null> {
  let p = bitmaps.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null);
    bitmaps.set(url, p);
  }
  return p;
}

async function template(icon: string, rarity: number): Promise<Jimp | null> {
  const [bg, art] = await Promise.all([bitmap(`${ART}/item_rarity_img/sprite_item_r${rarity}.png`), bitmap(`${ART}/item/${encodeURIComponent(icon)}.png`)]);
  if (!bg || !art) return null;
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bg, 0, 0, SIZE, SIZE);
  const k = Math.min(SIZE / art.width, SIZE / art.height, 1);
  const w = art.width * k, h = art.height * k;
  ctx.drawImage(art, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return prepareTemplate(await Jimp.read((await blob.arrayBuffer()) as unknown as Buffer));
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      order = m.order;
      if (templates) return post({ type: "ready", count: templates.size });
      const out = new Map<string, Jimp>();
      let done = 0;
      await Promise.all(m.items.map(async (it) => {
        const t = await template(it.icon, it.rarity);
        if (t) out.set(it.id, t);
        if (++done % 10 === 0) post({ type: "progress", step: `Preparing item pictures (${done}/${m.items.length})` });
      }));
      templates = out;
      post({ type: "ready", count: out.size });
    } else if (m.type === "recognize") {
      if (!templates) throw new Error("Not ready yet");
      const image = await Jimp.read(m.image as unknown as Buffer);
      const slots = await recognizeDepot(image, templates, order, (step) => post({ type: "progress", step, key: m.key }));
      post({ type: "result", key: m.key, slots, width: image.bitmap.width, height: image.bitmap.height });
    }
  } catch (err) {
    post({ type: "error", key: (m as { key?: string }).key, message: (err as Error).message || String(err) });
  }
};
