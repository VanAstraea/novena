"""Fetch the depot recogniser's own test screenshots and build templates, for tests/unit/depot.test.ts and the smoke test.

The screenshots (game images) and templates (game art) stay in .cache/dr/ and are never committed. Templates are
built the way the browser builds them: each item's art from the art mirror on its rarity background, 183 px. Run
after the pipeline has built public/data/v1/en.

    python scripts/depot_fixtures.py
"""

from __future__ import annotations

import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".cache" / "dr"
CASES = "https://raw.githubusercontent.com/arkntools/depot-recognition/main/test/cases/{case}/{file}"
ART = "https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main"
CASE_NAMES = ["us_simulator_0", "jp_simulator_0", "cn_ipad2021_0", "cn_iphone12_0", "tw_xperia1_0"]
GROUPS = ("material", "chip", "skill", "module", "exp", "other")


def get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "novena-tests"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except Exception:
        return None


def cached(url: str, path: Path) -> bytes | None:
    if path.exists():
        return path.read_bytes()
    data = get(url)
    if data is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return data


def main() -> None:
    for case in CASE_NAMES:
        for name in ("image.png", "image.jpg", "result.json"):
            cached(CASES.format(case=case, file=name), OUT / "cases" / case / name)
    items = json.loads((ROOT / "public/data/v1/en/items.json").read_text(encoding="utf-8"))["items"]
    built = 0
    with zipfile.ZipFile(OUT / "item.zip", "w") as zf:
        for iid, it in items.items():
            if it["group"] not in GROUPS or iid in ("EXP", "4001"):
                continue
            rarity = min(max(it["rarity"], 1), 6)
            bg = cached(f"{ART}/item_rarity_img/sprite_item_r{rarity}.png", OUT / "art" / f"r{rarity}.png")
            art = cached(f"{ART}/item/{it['icon']}.png", OUT / "art" / f"{it['icon']}.png")
            if not bg or not art:
                continue
            canvas = Image.open(io.BytesIO(bg)).convert("RGBA").resize((183, 183))
            icon = Image.open(io.BytesIO(art)).convert("RGBA")
            icon.thumbnail((183, 183))
            canvas.alpha_composite(icon, ((183 - icon.width) // 2, (183 - icon.height) // 2))
            buf = io.BytesIO()
            canvas.save(buf, "PNG")
            zf.writestr(f"{iid}.png", buf.getvalue())
            built += 1
    order = [i for i, _ in sorted(items.items(), key=lambda kv: kv[1]["sort"]) if i != "EXP"]
    (OUT / "order.json").write_text(json.dumps(order), encoding="utf-8")
    print(f"{len(CASE_NAMES)} cases, {built} templates in {OUT}")


if __name__ == "__main__":
    main()
