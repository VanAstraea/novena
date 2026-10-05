"""Builds public/sample-roster.json: a made-up mid-game account for "Try it with a sample roster" on the home page.

It's invented from Novena's own data (no real player's account): the operators community clears use most, at levels
a player a few months in would have, every 1-3 star at their cap, and a modest depot of common materials. Run from the
repo root after the data is built: python scripts/make_sample.py
"""

import json
import random

rnd = random.Random(7)
ops = {o["id"]: o for o in json.load(open("public/data/v1/en/operators.json", encoding="utf-8"))["ops"]}
usage = json.load(open("public/data/v1/common/usage.json", encoding="utf-8"))["ops"]
items = json.load(open("public/data/v1/en/items.json", encoding="utf-8"))

score = lambda cid: (usage.get(cid) or {}).get("score") or 0
global_ = [o for o in ops.values() if "en" in o["on"] and not o.get("src") and not o.get("patch") and o["obtain"] != "is"]
by_rarity = {r: sorted((o for o in global_ if o["rarity"] == r), key=lambda o: -score(o["id"])) for r in range(1, 7)}

CAP = {1: (0, 30), 2: (0, 30), 3: (1, 55), 4: (2, 70), 5: (2, 80), 6: (2, 90)}  # (top elite, level cap there)


def entry(o, elite, level, skill, masteries=(), mods=None):
    n = 3 if o["rarity"] == 6 else 2 if o["rarity"] >= 4 else 1 if o["rarity"] == 3 else 0
    ms = (list(masteries) + [0, 0, 0])[:n]
    return {"id": o["id"], "elite": elite, "level": level, "pot": rnd.choice([1, 1, 2, 3, 6]) if o["rarity"] <= 3 else rnd.choice([1, 1, 1, 2]),
            "skillLevel": skill, "masteries": ms if elite >= 2 and skill == 7 else [0] * n, "modules": mods or {}}


roster = []
for r in (1, 2, 3):
    for o in by_rarity[r]:
        e, lv = CAP[r]
        roster.append(entry(o, e, lv, 7 if r == 3 else 1))
for o in by_rarity[4][:24]:
    roster.append(entry(o, rnd.choice([1, 2, 2]), rnd.choice([45, 55, 60]), 7))
for i, o in enumerate(by_rarity[5][:22]):
    e = 2 if i < 12 else 1
    roster.append(entry(o, e, rnd.choice([40, 50, 60]) if e == 2 else 70, 7, masteries=[0, 3 if i < 3 else rnd.choice([0, 1, 2])] if e == 2 else (),
                        mods={o["mods"][0]: 1} if e == 2 and o["mods"] and i < 6 else None))
for i, o in enumerate(by_rarity[6][:9]):
    roster.append(entry(o, 2 if i < 6 else 1, rnd.choice([30, 40, 60]) if i < 6 else 80, 7,
                        masteries=[0, 0, 0] if i >= 6 else [rnd.choice([0, 1]), 0, 3] if i < 4 else [0, rnd.choice([1, 2]), 0],
                        mods={o["mods"][0]: 1} if i < 3 and o["mods"] else None))

common = [k for k, it in items["items"].items() if it.get("group") == "material" and k in items.get("values", {})]
depot = {k: rnd.randint(4, 60) for k in sorted(common)[:40]}
depot.update({"4001": 1_250_000, "2004": 60, "2003": 140, "2002": 200, "3301": 20, "3302": 18, "3303": 6})

out = {"app": "novena-roster", "version": 1, "sample": True, "ops": roster, "depot": depot}
json.dump(out, open("public/sample-roster.json", "w", encoding="utf-8"), separators=(",", ":"))
print(f"{len(roster)} operators ({sum(1 for x in roster if x['elite'] == 2)} at E2), {len(depot)} depot items")
