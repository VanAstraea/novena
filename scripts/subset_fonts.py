"""Trim the self-hosted fonts in public/fonts in place, without changing how any text looks.

Each file keeps exactly the characters it already covers (the Latin subset it was published with), its hinting and
every name record (copyright and licence included); only the layout features Novena never asks for (fractions,
numerators, denominators) and the glyph names are dropped. Running it again changes nothing. Needs fontTools and
brotli (pip install fonttools brotli).

    python scripts/subset_fonts.py
"""

from __future__ import annotations

import io
from pathlib import Path

from fontTools import subset

FONTS = Path(__file__).resolve().parents[1] / "public" / "fonts"
# what the CSS uses: kerning, ligatures, combining marks, lining and tabular figures (font-variant-numeric)
FEATURES = ["ccmp", "locl", "mark", "mkmk", "kern", "liga", "calt", "lnum", "tnum", "pnum"]

for path in sorted(FONTS.glob("*.woff2")):
    before = path.stat().st_size
    # pyftsubset's own load and save, so metrics and bounds stay exactly as published (no recalculation)
    options = subset.Options(layout_features=FEATURES, name_IDs=["*"], name_languages=["*"], name_legacy=True, flavor="woff2")
    font = subset.load_font(io.BytesIO(path.read_bytes()), options, dontLoadGlyphNames=True)
    sub = subset.Subsetter(options)
    sub.populate(unicodes=font.getBestCmap().keys())
    sub.subset(font)
    subset.save_font(font, str(path), options)
    print(f"{path.name:44} {before:7} -> {path.stat().st_size:7}")
