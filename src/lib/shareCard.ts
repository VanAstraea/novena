// "Share as image" on Today: a small stats card drawn on a canvas in this browser, in Novena's dark colours. Nothing is
// uploaded: the picture only leaves the page when the player saves it or hands it to the system share sheet. Text and
// shapes only (no operator art), so the canvas never needs images from other sites.

export interface CardData {
  server: string;
  date: string;
  tiles: [string, string][]; // label, value (up to 8)
  bands: { label: string; count: number; color: string }[];
  footer: string;
}

const C = { bg: "#0d0c0b", surface: "#161412", border: "#30281f", line: "#4b3d2f", text: "#f6f1e8", muted: "#b9afa2", accent: "#dfb768", ornament: "#c99c50" };
const SERIF = '"Cinzel", Georgia, serif';
const SANS = '"Alegreya Sans", system-ui, sans-serif';
const W = 1200, H = 675;

/** Letter-spaced text (canvas letterSpacing isn't everywhere yet). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number, align: "left" | "right" = "left") {
  const width = [...text].reduce((w, ch) => w + ctx.measureText(ch).width + gap, -gap);
  let at = align === "right" ? x - width : x;
  ctx.textAlign = "left";
  for (const ch of text) { ctx.fillText(ch, at, y); at += ctx.measureText(ch).width + gap; }
}

/** Shrink the font until the text fits `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > max && s > 12);
}

export async function drawCard(d: CardData): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load(`600 40px ${SERIF}`), document.fonts.load(`700 20px ${SANS}`), document.fonts.load(`500 20px ${SANS}`)]); } catch { /* system fonts then */ }
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // a gold frame with cut corners, like the site's panels
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  const m = 28, cut = 18;
  ctx.beginPath();
  ctx.moveTo(m + cut, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, H - m - cut); ctx.lineTo(W - m - cut, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, m + cut); ctx.closePath();
  ctx.stroke();
  // header: the wordmark, then what this is
  ctx.fillStyle = C.accent; ctx.textBaseline = "alphabetic";
  ctx.font = `600 46px ${SERIF}`;
  spaced(ctx, "NOVENA", 70, 112, 9);
  ctx.fillStyle = C.muted; ctx.font = `700 17px ${SANS}`;
  spaced(ctx, `ACCOUNT AT A GLANCE · ${d.server.toUpperCase()}`, W - 70, 96, 3, "right");
  ctx.font = `500 19px ${SANS}`; ctx.textAlign = "right";
  ctx.fillText(d.date, W - 70, 122);
  ctx.fillStyle = C.ornament; ctx.fillRect(70, 140, W - 140, 1.5);
  // tiles: two rows of four
  const cols = 4, gap = 16, top = 168, tw = (W - 140 - gap * (cols - 1)) / cols, th = 132;
  d.tiles.slice(0, 8).forEach(([k, v], i) => {
    const x = 70 + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + gap);
    ctx.fillStyle = C.surface; ctx.fillRect(x, y, tw, th);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, tw - 1.5, th - 1.5);
    ctx.fillStyle = C.muted; ctx.font = `700 15px ${SANS}`;
    spaced(ctx, k.toUpperCase(), x + 20, y + 38, 2);
    ctx.fillStyle = C.text; ctx.textAlign = "left";
    fit(ctx, v, 600, 50, SANS, tw - 40);
    ctx.fillText(v, x + 20, y + 100);
  });
  // operators by rarity, as one bar
  const by = top + 2 * (th + gap) + 14, total = d.bands.reduce((n, b) => n + b.count, 0);
  if (total) {
    let x = 70;
    const bw = W - 140;
    for (const b of d.bands) {
      const w = (b.count / total) * bw;
      ctx.fillStyle = b.color; ctx.fillRect(x, by, Math.max(0, w - 2), 12);
      x += w;
    }
    ctx.font = `500 19px ${SANS}`; ctx.textAlign = "left";
    let lx = 70;
    for (const b of d.bands) {
      ctx.fillStyle = b.color; ctx.fillRect(lx, by + 34, 12, 12);
      ctx.fillStyle = C.text;
      const t = `${b.label} ${b.count}`;
      ctx.fillText(t, lx + 20, by + 46);
      lx += 20 + ctx.measureText(t).width + 30;
    }
  }
  ctx.fillStyle = C.muted; ctx.font = `500 17px ${SANS}`; ctx.textAlign = "left";
  ctx.fillText(d.footer, 70, H - 52);
  return cv;
}

export const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
