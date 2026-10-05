"""Generates the Novena emblem SVGs (run: python docs/design/logo/make_logo.py).

The emblem: an elongated four-point star, faceted in two tones, pierced by a halo,
over nine gold rays (a novena is nine days), with feathered wings and a seal ring.
It is original artwork; it does not reproduce any official game emblem.
"""
from math import cos, sin, radians, hypot
from pathlib import Path

OUT = Path(__file__).parent
C = 256  # centre of the 512 canvas
GOLD_HI, GOLD, GOLD_LO = "#f8e3a3", "#d9b25c", "#a8792e"
IVORY, SHADE, INK = "#fbf8f0", "#d6ccb6", "#0b1020"


def f(n):
    return f"{n:.1f}".rstrip("0").rstrip(".")


def pt(p):
    return f"{f(p[0])} {f(p[1])}"


def defs():
    return f"""<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{GOLD_HI}"/><stop offset=".55" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_LO}"/>
  </linearGradient>
  <linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="{IVORY}"/>
  </linearGradient>
  <linearGradient id="feather" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0" stop-color="{IVORY}"/><stop offset="1" stop-color="{SHADE}"/>
  </linearGradient>
  <radialGradient id="core" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="{GOLD}"/>
  </radialGradient>
</defs>"""


def star(top, bottom, half_w, cy, waist):
    """Two facets of an elongated four-point star with concave sides."""
    l, r = C - half_w, C + half_w
    left = (f"M{pt((C, top))} Q{pt((C - waist, cy - waist * 1.6))} {pt((l, cy))} "
            f"Q{pt((C - waist, cy + waist * 1.6))} {pt((C, bottom))} Z")
    right = (f"M{pt((C, top))} Q{pt((C + waist, cy - waist * 1.6))} {pt((r, cy))} "
             f"Q{pt((C + waist, cy + waist * 1.6))} {pt((C, bottom))} Z")
    return left, right


def blade(b, t, w):
    """A feather blade from base b to tip t, fuller on one side."""
    dx, dy = t[0] - b[0], t[1] - b[1]
    L = hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    c1 = (b[0] + dx * .42 + nx * w, b[1] + dy * .42 + ny * w)
    c2 = (b[0] + dx * .6 - nx * w * .3, b[1] + dy * .6 - ny * w * .3)
    return f"M{pt(b)} Q{pt(c1)} {pt(t)} Q{pt(c2)} {pt(b)} Z"


def ray(angle, r0, r1, w):
    a = radians(angle)
    ux, uy = cos(a), sin(a)
    nx, ny = -uy, ux
    p0 = (C + ux * r0 + nx * w, C + uy * r0 + ny * w)
    p1 = (C + ux * r0 - nx * w, C + uy * r0 - ny * w)
    tip = (C + ux * r1, C + uy * r1)
    return f"M{pt(p0)} L{pt(tip)} L{pt(p1)} Z"


def sparkle(x, y, s):
    return (f"M{f(x)} {f(y - s)} L{f(x + s * .22)} {f(y - s * .22)} L{f(x + s)} {f(y)} L{f(x + s * .22)} {f(y + s * .22)} "
            f"L{f(x)} {f(y + s)} L{f(x - s * .22)} {f(y + s * .22)} L{f(x - s)} {f(y)} L{f(x - s * .22)} {f(y - s * .22)} Z")


def halo(cy, rx, ry, front):
    """Back (upper) or front (lower) half of the halo ellipse, so the star pierces it."""
    a, b = (C - rx, C + rx) if not front else (C + rx, C - rx)
    return f"M{f(a)} {f(cy)} A{f(rx)} {f(ry)} 0 0 1 {f(b)} {f(cy)}"


WING = [  # (tip, width): five blades sweeping up and out, upper first
    ((92, 128), 30), ((52, 186), 29), ((40, 246), 26), ((56, 302), 21), ((96, 348), 16),
]
WING_BASE = (236, 300)


def wing_group():
    parts = []
    for tip, w in reversed(WING):
        parts.append(f'<path d="{blade(WING_BASE, tip, w)}" fill="url(#feather)" stroke="url(#gold)" stroke-width="2.2" stroke-linejoin="round"/>')
        parts.append(f'<path d="M{pt(WING_BASE)} L{pt(tip)}" stroke="{GOLD_LO}" stroke-width="1" opacity=".55"/>')
    return "\n    ".join(parts)


def emblem(seal=True):
    star_l, star_r = star(top=58, bottom=470, half_w=118, cy=274, waist=13)
    rays = "\n    ".join(
        f'<path d="{ray(-90 + k * 40, 30, 214 if seal else 200, 7)}" fill="url(#gold)"/>' for k in range(9))
    minor = "\n    ".join(
        f'<path d="{ray(-70 + k * 40, 30, 150, 3)}" fill="{IVORY}" opacity=".55"/>' for k in range(9))
    ring = ""
    if seal:
        studs = "\n    ".join(
            f'<path d="{sparkle(C + cos(radians(-90 + k * 40)) * 208, C + sin(radians(-90 + k * 40)) * 208, 7)}" fill="url(#gold)"/>'
            for k in range(9))
        ring = f"""<circle cx="{C}" cy="{C}" r="244" fill="none" stroke="url(#gold)" stroke-width="4"/>
  <circle cx="{C}" cy="{C}" r="216" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
  <path id="arcTop" d="M{C - 223} {C} A223 223 0 0 1 {C + 223} {C}" fill="none"/>
  <path id="arcBottom" d="M{C - 236} {C} A236 236 0 0 0 {C + 236} {C}" fill="none"/>
  <g font-family="'Cormorant Garamond', Georgia, serif" font-size="19" font-weight="600" letter-spacing="9" fill="{GOLD_HI}" text-anchor="middle">
    <text><textPath href="#arcTop" startOffset="50%">ORA ✦ ET ✦ LABORA</textPath></text>
    <text><textPath href="#arcBottom" startOffset="50%">NOVEM ✦ DIES</textPath></text>
  </g>
  {studs}"""
    return f"""{ring}
  <g>
    {minor}
    {rays}
  </g>
  <path d="{halo(150, 82, 21, front=False)}" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
  <g>
    {wing_group()}
  </g>
  <g transform="translate(512 0) scale(-1 1)">
    {wing_group()}
  </g>
  <path d="{star_l}" fill="url(#ivory)"/>
  <path d="{star_r}" fill="{SHADE}"/>
  <path d="{star_l} {star_r}" fill="none" stroke="url(#gold)" stroke-width="2.5" stroke-linejoin="miter"/>
  <path d="M{C} 58 L{C} 470" stroke="{GOLD_LO}" stroke-width="1.2" opacity=".6"/>
  <path d="{halo(150, 82, 21, front=True)}" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
  <path d="{halo(150, 96, 25, front=True)}" fill="none" stroke="{GOLD_HI}" stroke-width="1.4" opacity=".7"/>
  <path d="M{C} 250 L{C + 16} 274 L{C} 298 L{C - 16} 274 Z" fill="url(#core)" stroke="{GOLD_LO}" stroke-width="1.5"/>
  <path d="M{C} 262 L{C + 7} 274 L{C} 286 L{C - 7} 274 Z" fill="{INK}"/>"""


def mark(mono=False):
    """Compact mark for small sizes: star, halo and core only."""
    star_l, star_r = star(top=40, bottom=488, half_w=150, cy=286, waist=18)
    if mono:
        fill_l = fill_r = stroke = "currentColor"
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="{halo(160, 130, 34, front=False)}" fill="none" stroke="{stroke}" stroke-width="22" stroke-linecap="round"/>
  <path d="{star_l}" fill="{fill_l}"/>
  <path d="{star_r}" fill="{fill_r}" opacity=".7"/>
  <path d="{halo(160, 130, 34, front=True)}" fill="none" stroke="{stroke}" stroke-width="22" stroke-linecap="round"/>
</svg>"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
{defs()}
  <path d="{halo(160, 130, 34, front=False)}" fill="none" stroke="url(#gold)" stroke-width="22" stroke-linecap="round"/>
  <path d="{star_l}" fill="url(#ivory)"/>
  <path d="{star_r}" fill="{SHADE}"/>
  <path d="{star_l} {star_r}" fill="none" stroke="url(#gold)" stroke-width="6" stroke-linejoin="miter"/>
  <path d="{halo(160, 130, 34, front=True)}" fill="none" stroke="url(#gold)" stroke-width="22" stroke-linecap="round"/>
  <path d="M{C} 258 L{C + 22} 286 L{C} 314 L{C - 22} 286 Z" fill="url(#gold)"/>
</svg>"""


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n{defs()}\n  {body}\n</svg>\n'


(OUT / "novena-emblem.svg").write_text(svg(emblem(seal=True)), encoding="utf-8")
(OUT / "novena-crest.svg").write_text(svg(emblem(seal=False)), encoding="utf-8")
(OUT / "novena-mark.svg").write_text(mark() + "\n", encoding="utf-8")
(OUT / "novena-mark-mono.svg").write_text(mark(mono=True) + "\n", encoding="utf-8")
print("wrote", ", ".join(p.name for p in sorted(OUT.glob("*.svg"))))
