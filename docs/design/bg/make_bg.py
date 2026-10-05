"""Novena's own backgrounds, drawn as SVG (no game art): a vaulted nave in one-point perspective with a rose window
at the far end, and a large rose window on its own. Warm black, brown and gold, to sit behind operator art and glass.

Run from the repo root: python docs/design/bg/make_bg.py  (writes public/bg/nave.svg and public/bg/rose.svg)
"""
import math
import random
from pathlib import Path

OUT = Path("public/bg")
GOLD, GOLD_HI, BROWN = "#c99c50", "#f2d599", "#4b3d2f"
W, H = 1600, 900


def arch(cx, yb, w, ys):
    """An equilateral pointed arch, w wide, legs from yb up to the springing line ys."""
    l, r = cx - w / 2, cx + w / 2
    apex = ys - w * math.sqrt(3) / 2
    return f"M{l:.1f},{yb:.1f} L{l:.1f},{ys:.1f} A{w:.1f},{w:.1f} 0 0 1 {cx:.1f},{apex:.1f} A{w:.1f},{w:.1f} 0 0 1 {r:.1f},{ys:.1f} L{r:.1f},{yb:.1f}"


def rose(cx, cy, r, petals=12, stroke=GOLD, sw=1.2, op=0.7):
    """Rose-window tracery: rim, a ring of petal circles, spokes, an inner ring and a centre."""
    out = [f'<g fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-opacity="{op}">',
           f'<circle cx="{cx}" cy="{cy}" r="{r}"/>', f'<circle cx="{cx}" cy="{cy}" r="{r * 0.93:.1f}"/>']
    pr = r * math.sin(math.pi / petals) * 0.62
    for i in range(petals):
        a = 2 * math.pi * i / petals
        out.append(f'<circle cx="{cx + math.cos(a) * r * 0.72:.1f}" cy="{cy + math.sin(a) * r * 0.72:.1f}" r="{pr:.1f}"/>')
        b = a + math.pi / petals
        out.append(f'<line x1="{cx + math.cos(b) * r * 0.36:.1f}" y1="{cy + math.sin(b) * r * 0.36:.1f}" x2="{cx + math.cos(b) * r * 0.93:.1f}" y2="{cy + math.sin(b) * r * 0.93:.1f}"/>')
        out.append(f'<circle cx="{cx + math.cos(a) * r * 0.36:.1f}" cy="{cy + math.sin(a) * r * 0.36:.1f}" r="{r * 0.09:.1f}"/>')
    out += [f'<circle cx="{cx}" cy="{cy}" r="{r * 0.36:.1f}"/>', f'<circle cx="{cx}" cy="{cy}" r="{r * 0.12:.1f}"/>',
            f'<path d="M{cx},{cy - r * 0.12:.1f} L{cx + r * 0.035:.1f},{cy:.1f} L{cx},{cy + r * 0.12:.1f} L{cx - r * 0.035:.1f},{cy:.1f}Z" fill="{GOLD_HI}" fill-opacity="0.6"/>',
            "</g>"]
    return "\n".join(out)


def motes(n, seed, box):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    return "\n".join(f'<circle cx="{rnd.uniform(x0, x1):.0f}" cy="{rnd.uniform(y0, y1):.0f}" r="{rnd.uniform(0.6, 2.2):.1f}" fill="{GOLD_HI}" fill-opacity="{rnd.uniform(0.08, 0.5):.2f}"/>' for _ in range(n))


def nave():
    vx, vy = 800, 400  # vanishing point, behind the rose window
    floor = 900
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">',
             """<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17120d"/><stop offset="0.55" stop-color="#110e0b"/><stop offset="1" stop-color="#0d0c0b"/></linearGradient>
  <radialGradient id="glow" cx="800" cy="300" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2d599" stop-opacity="0.38"/><stop offset="0.35" stop-color="#c99c50" stop-opacity="0.12"/><stop offset="1" stop-color="#c99c50" stop-opacity="0"/></radialGradient>
  <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d599" stop-opacity="0.16"/><stop offset="1" stop-color="#f2d599" stop-opacity="0"/></linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></radialGradient>
</defs>""",
             f'<rect width="{W}" height="{H}" fill="url(#bg)"/>', f'<rect width="{W}" height="{H}" fill="url(#glow)"/>']
    # floor: lines to the vanishing point, and courses getting closer with distance
    fl = [f'<line x1="{vx}" y1="{vy + 110}" x2="{vx + (x - vx) * 3:.0f}" y2="{floor + 300}"/>' for x in range(160, 1441, 160)]
    for i in range(10):
        s = 0.86 ** i
        y, half = vy + 110 + 600 * s, 750 * s
        fl.append(f'<line x1="{vx - half:.1f}" y1="{y:.1f}" x2="{vx + half:.1f}" y2="{y:.1f}"/>')
    parts.append(f'<g stroke="{BROWN}" stroke-width="1" stroke-opacity="0.55">' + "".join(fl) + "</g>")
    # the far wall: three lancets under the rose
    for dx, h in ((-46, 120), (0, 150), (46, 120)):
        parts.append(f'<path d="{arch(vx + dx, vy + 110, 30, vy + 110 - h + 26)}Z" fill="{GOLD_HI}" fill-opacity="0.22" stroke="{GOLD}" stroke-opacity="0.6"/>')
    parts.append(rose(vx, vy - 70, 64, op=0.85))
    # light falling from the rose
    for x0, x1, w in ((-60, -420, 90), (-10, -40, 120), (40, 380, 90), (0, 160, 60)):
        parts.append(f'<path d="M{vx + x0 - 8},{vy - 40} L{vx + x0 + 8},{vy - 40} L{vx + x1 + w},{floor} L{vx + x1 - w},{floor}Z" fill="url(#ray)"/>')
    # bays of the vault, near to far: each a pointed arch with its piers; nearer ones are darker and bolder
    for i in range(9, -1, -1):
        s = 0.86 ** i
        w = 1500 * s
        yb = vy + 110 + 600 * s
        ys = vy + 110 - 260 * s
        op = 0.18 + 0.6 * (1 - i / 9)
        parts.append(f'<path d="{arch(vx, yb, w, ys)}" fill="none" stroke="{GOLD}" stroke-opacity="{op * 0.55:.2f}" stroke-width="{1 + 5 * s:.1f}"/>')
        parts.append(f'<path d="{arch(vx, yb, w * 0.97, ys)}" fill="none" stroke="{BROWN}" stroke-opacity="{op:.2f}" stroke-width="{0.6 + 2 * s:.1f}"/>')
        for side in (-1, 1):
            x = vx + side * w / 2
            parts.append(f'<rect x="{x - 9 * s:.1f}" y="{yb - 14 * s:.1f}" width="{18 * s:.1f}" height="{14 * s:.1f}" fill="{BROWN}" fill-opacity="{op:.2f}"/>')
    parts.append(motes(140, 7, (300, 80, 1300, 880)))
    parts.append(f'<rect width="{W}" height="{H}" fill="url(#vig)"/>')
    parts.append("</svg>")
    return "\n".join(parts)


def rose_bg():
    cx, cy, r = 1120, 400, 330
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">',
             f"""<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d0c0b"/><stop offset="0.6" stop-color="#16110c"/><stop offset="1" stop-color="#1e1710"/></linearGradient>
  <radialGradient id="glow" cx="{cx}" cy="{cy}" r="{r * 1.9}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2d599" stop-opacity="0.30"/><stop offset="0.3" stop-color="#c99c50" stop-opacity="0.14"/><stop offset="1" stop-color="#c99c50" stop-opacity="0"/></radialGradient>
  <linearGradient id="ray" x1="1" y1="0.3" x2="0" y2="0.7"><stop offset="0" stop-color="#f2d599" stop-opacity="0.09"/><stop offset="1" stop-color="#f2d599" stop-opacity="0"/></linearGradient>
</defs>""",
             f'<rect width="{W}" height="{H}" fill="url(#bg)"/>', f'<rect width="{W}" height="{H}" fill="url(#glow)"/>']
    for a, w in ((158, 0.05), (168, 0.03), (180, 0.06), (196, 0.025)):
        t1, t2 = math.radians(a - w * 57), math.radians(a + w * 57)
        parts.append(f'<path d="M{cx},{cy} L{cx + math.cos(t1) * 2200:.0f},{cy - math.sin(t1) * 2200:.0f} L{cx + math.cos(t2) * 2200:.0f},{cy - math.sin(t2) * 2200:.0f}Z" fill="url(#ray)"/>')
    parts.append(rose(cx, cy, r, petals=16, sw=2, op=0.5))
    parts.append(rose(cx, cy, r * 0.5, petals=8, sw=1.2, op=0.35))
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 1.12:.0f}" fill="none" stroke="{GOLD}" stroke-opacity="0.18" stroke-width="1"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 1.2:.0f}" fill="none" stroke="{GOLD}" stroke-opacity="0.10" stroke-width="1" stroke-dasharray="2 10"/>')
    parts.append(motes(110, 11, (500, 0, 1600, 900)))
    parts.append("</svg>")
    return "\n".join(parts)


OUT.mkdir(parents=True, exist_ok=True)
(OUT / "nave.svg").write_text(nave(), encoding="utf-8", newline="\n")
(OUT / "rose.svg").write_text(rose_bg(), encoding="utf-8", newline="\n")
print("wrote", *(f"{p.name} ({p.stat().st_size // 1024} KB)" for p in sorted(OUT.iterdir())))
