// "Save as image" on Tier lists: the list drawn on a canvas in this browser, in the theme's colours. Avatars come
// straight from the art mirror with CORS (it allows any site), so they never taint the canvas; one that won't load
// is drawn as its initials, and if pictures can't be used at all the list is drawn with names only. Nothing is
// uploaded.
import { art } from "./data";
import type { TierList } from "./tierlist";

const SERIF = '"Cinzel", Georgia, serif';
const SANS = '"Alegreya Sans", system-ui, sans-serif';
const W = 1200, PAD = 36, LABEL = 132, GAP = 8;

function token(name: string, fallback: string) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback; } catch { return fallback; }
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Lines of `text` wrapped to `max` pixels. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

type Op = { id: string; name: string };

async function draw(list: TierList, ops: Map<string, Op>, pictures: boolean): Promise<HTMLCanvasElement> {
  const C = {
    bg: token("bg", "#0d0c0b"), surface: token("surface", "#161412"), border: token("border", "#30281f"), text: token("text", "#f6f1e8"),
    muted: token("muted", "#b9afa2"), accent: token("accent", "#dfb768"), ink: token("accent-ink", "#17110a"), ornament: token("ornament", "#c99c50"),
  };
  const imgs = new Map<string, HTMLImageElement | null>();
  if (pictures) {
    const ids = list.tiers.flatMap((t) => t.ops);
    await Promise.all(ids.map(async (id) => imgs.set(id, await loadImg(art.avatar(id)))));
  }
  const measure = document.createElement("canvas").getContext("2d")!;
  const area = W - PAD * 2 - LABEL - GAP * 2;
  // lay out each tier: cells for pictures, flowing name chips without
  const CELL = 84, CELL_H = 104, CHIP_H = 34;
  const rows = list.tiers.map((t) => {
    const names = t.ops.map((id) => ops.get(id)?.name || id);
    let h: number;
    const chips: { x: number; y: number; w: number; name: string; id: string }[] = [];
    if (pictures) {
      const per = Math.max(1, Math.floor(area / CELL));
      names.forEach((name, i) => chips.push({ x: (i % per) * CELL, y: Math.floor(i / per) * CELL_H, w: CELL, name, id: t.ops[i] }));
      h = Math.max(1, Math.ceil(names.length / per)) * CELL_H;
    } else {
      measure.font = `600 18px ${SANS}`;
      let x = 0, y = 0;
      names.forEach((name, i) => {
        const w = Math.min(area, measure.measureText(name).width + 24);
        if (x + w > area && x > 0) { x = 0; y += CHIP_H + 6; }
        chips.push({ x, y, w, name, id: t.ops[i] });
        x += w + 6;
      });
      h = Math.max(CHIP_H, y + CHIP_H);
    }
    measure.font = `500 16px ${SANS}`;
    const note = t.note ? wrap(measure, t.note, area) : [];
    return { t, chips, h: Math.max(h + 20 + note.length * 22, 96), note };
  });
  const top = 120;
  const H = top + rows.reduce((n, r) => n + r.h + GAP, 0) + 60;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.accent; ctx.font = `600 38px ${SERIF}`; ctx.textAlign = "left";
  ctx.fillText(ellipsis(ctx, list.title || "Tier list", W - PAD * 2), PAD, 72);
  ctx.fillStyle = C.ornament; ctx.fillRect(PAD, 92, W - PAD * 2, 1.5);
  let y = top;
  for (const r of rows) {
    const color = token(r.t.color, C.muted);
    ctx.fillStyle = color; ctx.fillRect(PAD, y, LABEL, r.h);
    ctx.fillStyle = r.t.color === "surface-3" ? C.text : C.ink;
    ctx.textAlign = "center";
    const size = r.t.name.length <= 2 ? 44 : r.t.name.length <= 8 ? 24 : 18;
    ctx.font = `700 ${size}px ${SANS}`;
    const lines = wrap(ctx, r.t.name || " ", LABEL - 16).slice(0, 3);
    lines.forEach((ln, i) => ctx.fillText(ellipsis(ctx, ln, LABEL - 12), PAD + LABEL / 2, y + r.h / 2 + size * 0.35 + (i - (lines.length - 1) / 2) * size * 1.1));
    const x0 = PAD + LABEL + GAP;
    ctx.fillStyle = C.surface; ctx.fillRect(x0, y, W - PAD - x0, r.h);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y + 0.5, W - PAD - x0 - 1, r.h - 1);
    ctx.textAlign = "left";
    for (const c of r.chips) {
      const cx = x0 + GAP + c.x, cy = y + 10 + c.y;
      if (pictures) {
        const img = imgs.get(c.id);
        if (img) ctx.drawImage(img, cx + 6, cy, 72, 72);
        else {
          ctx.fillStyle = C.border; ctx.fillRect(cx + 6, cy, 72, 72);
          ctx.fillStyle = C.muted; ctx.font = `700 22px ${SANS}`; ctx.textAlign = "center";
          ctx.fillText(c.name.slice(0, 2).toUpperCase(), cx + 42, cy + 44);
        }
        ctx.fillStyle = C.text; ctx.font = `500 14px ${SANS}`; ctx.textAlign = "center";
        ctx.fillText(ellipsis(ctx, c.name, CELL - 6), cx + CELL / 2, cy + 90);
        ctx.textAlign = "left";
      } else {
        ctx.strokeStyle = C.border; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.75, cy + 0.75, c.w - 1.5, CHIP_H - 1.5);
        ctx.fillStyle = C.text; ctx.font = `600 18px ${SANS}`;
        ctx.fillText(ellipsis(ctx, c.name, c.w - 24), cx + 12, cy + 23);
      }
    }
    if (r.note.length) {
      ctx.fillStyle = C.muted; ctx.font = `500 16px ${SANS}`;
      r.note.forEach((ln, i) => ctx.fillText(ln, x0 + GAP, y + r.h - 12 - (r.note.length - 1 - i) * 22));
    }
    y += r.h + GAP;
  }
  ctx.fillStyle = C.muted; ctx.font = `500 16px ${SANS}`; ctx.textAlign = "left";
  ctx.fillText("Made with Novena, a free Arknights companion", PAD, H - 26);
  return cv;
}

const blob = (cv: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  try { cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"); } catch (e) { reject(e as Error); }
});

/** The list as a PNG: with avatars when they can be drawn, names only otherwise. */
export async function tierImage(list: TierList, ops: Map<string, Op>, pictures = true): Promise<Blob> {
  try { await Promise.all([document.fonts.load(`600 38px ${SERIF}`), document.fonts.load(`700 20px ${SANS}`), document.fonts.load(`500 16px ${SANS}`)]); } catch { /* system fonts then */ }
  if (pictures) {
    try { return await blob(await draw(list, ops, true)); } catch { /* names only */ }
  }
  return blob(await draw(list, ops, false));
}
