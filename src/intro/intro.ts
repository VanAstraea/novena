// The first-visit intro: one camera move over Lemuen's outfit art (the Law, the devotee, the halo), a bloom to white,
// and at the peak of the white the real home page takes over (`onReveal`) while the white fades. Every effect is a
// Web Animation on one shared timeline, so skipping just finishes them. See docs/design/previews/intro.html.
import "./intro.css";

export interface IntroOptions {
  artSrc: string; // the outfit art (4.7 MB): the darkness beat plays while it loads
  halo: () => [number, number]; // where the home hero's halo sits on screen, for the effects after the swap
  onReveal: () => void; // the white is at its peak: start the home page's own entrance
  onDone: (how: "done" | "skipped" | "failed") => void; // failed: the art didn't arrive in time
}

const SWAP = 4900, IGNITE = 1650, T = 6200;
const NEED_ART = 1100, MAX_WAIT = 3500; // the art first shows at 1.15 s; hold in the dark this long for it
// Points of interest in the art, in its own pixels.
const STAR = [1024, 92], DEVOTEE = [1352, 1245], HANDS = [1271, 1234], HALO = [998, 472], FACE = [998, 520];
const E = {
  linear: "linear",
  inout: "cubic-bezier(.65,0,.35,1)",
  in: "cubic-bezier(.7,0,.84,0)",
  out: "cubic-bezier(.16,1,.3,1)",
  soft: "cubic-bezier(.4,0,.2,1)",
};
const DARK = "0 2px 18px rgba(6, 8, 15, 0.9), 0 0 2px rgba(6, 8, 15, 0.8)";
const GLOW = "0 0 18px rgba(255, 236, 180, 0.95), 0 0 3px rgba(255, 255, 255, 0.9)";

type Frame = { t: number; e?: string } & Record<string, string | number | undefined>;

export function runIntro(root: HTMLElement, opts: IntroOptions): { skip: () => void } {
  const W = innerWidth, H = innerHeight;
  root.className = "iv";
  root.setAttribute("role", "presentation");
  root.innerHTML = `
    <div class="layer"><div class="cam"></div></div>
    <div class="layer leak"></div>
    <div class="layer vig-tight"></div>
    <div class="layer vig-wide"></div>
    <div class="layer star-glow"></div>
    <div class="layer"><div class="at rays star-rays"></div></div>
    <div class="layer candle"></div>
    <div class="layer"><div class="at halo-glow"></div></div>
    <div class="layer"><div class="at rays halo-rays"></div></div>
    <div class="layer"><div class="at bloom"></div></div>
    <div class="layer fx"></div>
    <div class="layer white"></div>
    <canvas class="layer"></canvas>
    <div class="layer lines">
      <p class="latin" lang="la">Et lux perpetua luceat eis.</p>
      <p class="english">And let perpetual light shine upon them.</p>
      <p class="ora" lang="la">Ora et labora</p>
      <p class="pray">Pray, and work.</p>
    </div>
    <button class="skip" type="button">Skip</button>`;
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
  const cam = q(".cam");
  const art = new Image();
  art.alt = "";
  art.src = opts.artSrc;
  cam.append(art);
  let artReady = false;
  art.decode().then(() => (artReady = true), () => {});

  const anims: Animation[] = [];
  function track(el: Element, frames: Frame[]) {
    frames = frames.map((f) => ({ ...f, t: Math.max(0, Math.min(T, f.t)) }));
    if (frames[0].t > 0) frames.unshift({ ...frames[0], t: 0 });
    if (frames[frames.length - 1].t < T) frames.push({ ...frames[frames.length - 1], t: T });
    const kf = frames.map(({ t, e, ...css }) => ({ ...css, offset: t / T, easing: e || E.soft })) as Keyframe[];
    const a = el.animate(kf, { duration: T, fill: "both" });
    anims.push(a);
    return a;
  }
  const place = (el: HTMLElement, x: number, y: number) => Object.assign(el.style, { left: x + "px", top: y + "px" });
  const camAt = (f: number[], s: number, px = 0.5, py = 0.5) => `translate(${W * px - f[0] * s}px, ${H * py - f[1] * s}px) scale(${s})`;
  const hy = H * 0.46 - (FACE[1] - HALO[1]) * 1.8; // the halo on screen in the close-up before the bloom
  const hero = opts.halo();

  function shock(x: number, y: number, t: number, flat = false, grow = 3, life = 900) {
    const el = document.createElement("div");
    el.className = "at shock" + (flat ? " flat" : "");
    q(".fx").append(el);
    place(el, x, y);
    track(el, [{ t: t - 1, opacity: 0, transform: "scale(.15)", e: "step-end" }, { t, opacity: 1, transform: "scale(.15)", e: E.out }, { t: t + life, opacity: 0, transform: `scale(${grow})` }]);
  }
  function flare(y: number, t: number, peak: number, life: number) {
    const el = document.createElement("div");
    el.className = "at flare";
    q(".fx").append(el);
    el.style.top = y + "px";
    track(el, [{ t: t - 280, opacity: 0, transform: "scaleX(.05)", e: E.out }, { t, opacity: peak, transform: "scaleX(1)" }, { t: t + life, opacity: 0, transform: "scaleX(1.5)" }]);
  }
  function split(el: Element) {
    el.innerHTML = [...(el.textContent || "")].map((c) => `<span class="ch">${c}</span>`).join("");
    return [...el.children];
  }
  function letters(chars: Element[], inAt: number, inStep: number, dur: number, outAt: number, outStep: number, up: number) {
    chars.forEach((c, j) => {
      const t = inAt + j * inStep, o = outAt + j * outStep;
      track(c, [
        { t, opacity: 0, transform: "translateY(18px) scale(1.15)", filter: "blur(10px)", e: E.out },
        { t: t + dur, opacity: 1, transform: "none", filter: "blur(0px)" },
        { t: o, opacity: 1, transform: "none", filter: "blur(0px)", e: E.in },
        { t: o + 340, opacity: 0, transform: `translateY(${up}px) scale(1.25)`, filter: "blur(6px)" },
      ]);
    });
  }
  function glint(chars: Element[], t0: number, step: number, color: string) {
    chars.forEach((c, j) => {
      const t = t0 + j * step;
      track(c, [{ t, color, textShadow: DARK, e: E.out }, { t: t + 110, color: "#fffbea", textShadow: GLOW }, { t: t + 330, color, textShadow: DARK }]);
    });
  }

  place(q(".star-rays"), W / 2, H / 2);
  place(q(".halo-glow"), W / 2, hy);
  place(q(".halo-rays"), W / 2, hy);
  place(q(".bloom"), W / 2, hy);

  // Camera: a slow push on the star with a kick when it ignites, a pan down to the devotee, a tilt up to the halo
  // that accelerates into the bloom. The home page takes over behind the white.
  track(cam, [
    { t: 0, transform: camAt(STAR, 1.22), e: E.linear },
    { t: IGNITE - 50, transform: camAt(STAR, 1.29), e: E.out },
    { t: IGNITE + 120, transform: camAt(STAR, 1.345), e: E.linear },
    { t: 2400, transform: camAt(STAR, 1.37), e: E.inout },
    { t: 3500, transform: camAt(DEVOTEE, 1.3), e: E.linear },
    { t: 3700, transform: camAt(DEVOTEE, 1.33), e: E.inout },
    { t: 4400, transform: camAt(FACE, 1.55, 0.5, 0.46), e: E.in },
    { t: SWAP, transform: camAt(FACE, 2.05, 0.5, 0.46) },
  ]);
  track(art, [{ t: 1150, opacity: 0 }, { t: 2100, opacity: 1 }, { t: SWAP - 1, opacity: 1, e: "step-end" }, { t: SWAP, opacity: 0 }]);
  track(root, [{ t: SWAP - 1, backgroundColor: "#06080f", e: "step-end" }, { t: SWAP, backgroundColor: "rgba(6,8,15,0)" }]);

  // Darkness, and the Law.
  track(q(".leak"), [{ t: 200, opacity: 0, transform: "translateX(-4%)" }, { t: 1100, opacity: 1 }, { t: 2100, opacity: 0, transform: "translateX(3%)" }]);
  track(q(".star-glow"), [{ t: 1100, opacity: 0 }, { t: IGNITE - 40, opacity: 0.6, e: E.out }, { t: IGNITE + 60, opacity: 1 }, { t: 2400, opacity: 0.5 }, { t: 2900, opacity: 0 }]);
  track(q(".star-rays"), [{ t: IGNITE - 200, opacity: 0, transform: "rotate(-8deg) scale(.6)", e: E.out }, { t: IGNITE + 150, opacity: 0.9, transform: "rotate(0deg) scale(1)", e: E.linear }, { t: 2500, opacity: 0.55, transform: "rotate(9deg) scale(1.08)" }, { t: 2900, opacity: 0, transform: "rotate(12deg) scale(1.1)" }]);
  shock(W / 2, H / 2, IGNITE, false, 3.4, 1000);
  flare(H / 2, IGNITE, 0.75, 600);
  track(q(".vig-tight"), [{ t: 2350, opacity: 1 }, { t: 3000, opacity: 0 }]);
  track(q(".vig-wide"), [{ t: 2300, opacity: 0 }, { t: 2900, opacity: 1 }, { t: 4300, opacity: 1 }, { t: 4750, opacity: 0.5 }, { t: SWAP - 1, opacity: 0.5, e: "step-end" }, { t: SWAP, opacity: 0 }]);

  // The devotee, by candlelight.
  track(q(".candle"), [
    { t: 2600, opacity: 0 }, { t: 2900, opacity: 0.55, e: E.linear }, { t: 3050, opacity: 0.8, e: E.linear }, { t: 3180, opacity: 0.5, e: E.linear },
    { t: 3330, opacity: 0.85, e: E.linear }, { t: 3500, opacity: 0.6, e: E.linear }, { t: 3650, opacity: 0.75 }, { t: 4000, opacity: 0 },
  ]);

  // The halo pulses, rays gather, and everything blooms to white.
  track(q(".halo-glow"), [{ t: 3800, opacity: 0, transform: "scale(.7)" }, { t: 4400, opacity: 0.8, transform: "scale(1)", e: E.in }, { t: 4850, opacity: 1, transform: "scale(1.6)" }, { t: 5200, opacity: 0 }]);
  track(q(".halo-rays"), [{ t: 3900, opacity: 0, transform: "rotate(0deg) scale(.5)", e: E.in }, { t: SWAP, opacity: 1, transform: "rotate(-24deg) scale(1.5)" }, { t: 5300, opacity: 0, transform: "rotate(-30deg) scale(1.7)" }]);
  shock(W / 2, hy, 4180, true, 3, 800);
  shock(W / 2, hy, 4480, true, 4.2, 800);
  flare(hy, SWAP - 30, 1, 600);
  track(q(".bloom"), [
    { t: 4250, opacity: 0, transform: "scale(.2)", e: E.in },
    { t: 4650, opacity: 0.9, transform: "scale(1)", e: E.in },
    { t: SWAP, opacity: 1, transform: "scale(7)" },
    { t: 5600, opacity: 0, transform: "scale(7)" },
  ]);
  track(q(".white"), [
    { t: IGNITE - 70, opacity: 0, e: E.out }, { t: IGNITE, opacity: 0.1 }, { t: IGNITE + 260, opacity: 0 },
    { t: 4500, opacity: 0, e: E.in }, { t: SWAP, opacity: 1, e: E.linear }, { t: 5000, opacity: 1, e: E.out }, { t: 6100, opacity: 0 },
  ]);
  // After the swap, the rings pulse from the home hero's own halo.
  shock(hero[0], hero[1], 5020, true, 6, 1100);
  shock(hero[0], hero[1], 5300, true, 4.5, 1000);

  // Words.
  const [l1, l2, l3, l4] = [...root.querySelectorAll(".lines p")];
  const c1 = split(l1), c3 = split(l3);
  letters(c1, 250, 24, 480, 2350, 10, -10);
  glint(c1, IGNITE, 16, "#f3d993");
  track(l2, [{ t: 1300, opacity: 0, transform: "translateY(8px)" }, { t: 1900, opacity: 1, transform: "none" }, { t: 2350, opacity: 1 }, { t: 2750, opacity: 0 }]);
  letters(c3, 3300, 55, 520, 4600, 14, -18);
  glint(c3, 4200, 26, "#f5f0e6");
  track(l4, [{ t: 3850, opacity: 0, transform: "translateY(8px)" }, { t: 4250, opacity: 1, transform: "none" }, { t: 4550, opacity: 1 }, { t: 4800, opacity: 0 }]);
  track(q(".skip"), [{ t: 300, opacity: 0 }, { t: 900, opacity: 1 }, { t: 4800, opacity: 1 }, { t: 5200, opacity: 0 }]);

  // Particles: sparks from the devotee's hands, then a feather burst from the halo.
  const cv = q<HTMLCanvasElement>("canvas"), ctx = cv.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  let seed = 9;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const LIFE = 1.7;
  const burst = Array.from({ length: 72 }, () => ({
    born: 4560 + r() * 440, ang: r() * Math.PI * 2, v: 240 + r() * 680, tau: 0.45 + r() * 0.5,
    len: 4 + r() * 7, rot: r() * Math.PI * 2, spin: (r() - 0.5) * 3, gold: r() < 0.25, sway: 6 + r() * 16, ph: r() * 6,
  }));
  const sparks = Array.from({ length: 48 }, () => ({ born: 3050 + r() * 950, vx: (r() - 0.5) * 40, vy: 50 + r() * 110, s: 6 + r() * 12, life: 1 + r() * 0.8, ph: r() * 6 }));
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  { const s = sprite.getContext("2d")!, g = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,240,200,1)"); g.addColorStop(0.35, "rgba(243,217,147,.5)"); g.addColorStop(1, "rgba(243,217,147,0)");
    s.fillStyle = g; s.fillRect(0, 0, 32, 32); }
  const hands = [W / 2 + (HANDS[0] - DEVOTEE[0]) * 1.33, H / 2 + (HANDS[1] - DEVOTEE[1]) * 1.33];
  function feather(x: number, y: number, len: number, ang: number, a: number, gold: boolean) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = a;
    ctx.fillStyle = gold ? "#f3d993" : "#fffaf0";
    ctx.beginPath(); ctx.ellipse(0, 0, len, len * 0.27, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a * 0.7; ctx.strokeStyle = gold ? "#b98a33" : "#d9d1bf"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-len * 1.2, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore();
  }
  let raf = 0, holdFrom = 0;
  function frame(now: number) {
    const t = Number(anims[0]?.currentTime ?? 0);
    // Not loaded yet when it's needed: hold in the dark; give up quietly if it takes too long.
    if (!artReady && t >= NEED_ART) {
      if (!holdFrom) { holdFrom = now; anims.forEach((a) => a.pause()); }
      else if (now - holdFrom > MAX_WAIT) return giveUp();
    } else if (holdFrom) { holdFrom = 0; anims.forEach((a) => a.play()); }
    if (!revealed && t >= SWAP) { revealed = true; root.style.pointerEvents = "none"; opts.onReveal(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const p of sparks) {
      const a = (t - p.born) / 1000;
      if (a <= 0 || a > p.life) continue;
      const x = hands[0] + p.vx * a + Math.sin(a * 3 + p.ph) * 8, y = hands[1] - p.vy * a - 30 * a * a;
      ctx.globalAlpha = Math.min(1, a / 0.15) * (1 - a / p.life) * (0.7 + 0.3 * Math.sin(a * 20 + p.ph));
      ctx.drawImage(sprite, x - p.s / 2, y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const o = t >= SWAP ? hero : [W / 2, hy];
    for (const p of burst) {
      const a = (t - p.born) / 1000;
      if (a <= 0 || a > LIFE) continue;
      const d = p.v * p.tau * (1 - Math.exp(-a / p.tau));
      const x = o[0] + Math.cos(p.ang) * d + Math.sin(a * 1.6 + p.ph) * p.sway * a;
      const y = o[1] + Math.sin(p.ang) * d * 0.8 + 22 * a * a;
      feather(x, y, p.len, p.rot + p.spin * a, Math.min(1, a / 0.12) * Math.max(0, Math.min(1, 1 - (a - 0.8) / (LIFE - 0.8))), p.gold);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // The handover: the home page starts its entrance at the peak of the white (checked each frame above, so a hold
  // shifts it); the overlay leaves when the white is gone.
  let revealed = false, finished = false;
  function giveUp() {
    finished = true;
    cancelAnimationFrame(raf);
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: "ease-out", fill: "forwards" }).finished.then(() => {
      anims.forEach((a) => a.cancel());
      removeEventListener("keydown", onKey);
      removeEventListener("wheel", onSkip);
      opts.onDone("failed");
    });
  }
  function finish(skipped: boolean) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    anims.forEach((a) => a.cancel());
    removeEventListener("keydown", onKey);
    removeEventListener("wheel", onSkip);
    opts.onDone(skipped ? "skipped" : "done");
  }
  const onSkip = () => { if (!revealed) finish(true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
  root.addEventListener("click", onSkip);
  addEventListener("keydown", onKey);
  addEventListener("wheel", onSkip, { passive: true });
  anims[0].finished.then(() => finish(false), () => {});
  return { skip: onSkip };
}
