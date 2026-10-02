"""Recruitment pool and tags per server (ported from ako's recruit.py).

`gacha_table.recruitDetail` lists every recruitable operator under a star line; tags come from the class, Melee or
Ranged, `tagList`, Top/Senior Operator by rarity, and Male/Female from the handbook (ako couldn't model gender).
The site combines them (src/lib/recruit.ts).
"""

from __future__ import annotations

import re

from novena_pipeline import gamedata as gd
from novena_pipeline.operators import gender

CLASS_TAG_ID = {"WARRIOR": 1, "SNIPER": 2, "TANK": 3, "MEDIC": 4, "SUPPORT": 5, "CASTER": 6, "SPECIAL": 7, "PIONEER": 8}
POSITION_TAG_ID = {"MELEE": 9, "RANGED": 10}
TOP, SENIOR, MALE, FEMALE = 11, 14, 1012, 1013


def _name_key(name: str) -> str:
    return re.sub(r"[\"'‘’“”]", "", name).strip().lower()


def build(server: str) -> dict:
    g = gd.table("gacha_table", server)
    tags = [{"id": t["tagId"], "name": t["tagName"], "group": t.get("tagGroup", 0)} for t in g["gachaTags"]]
    by_name_tag = {t["name"]: t["id"] for t in tags}
    chars = gd.table("character_table", server)
    by_name = {_name_key(e["name"]): cid for cid, e in chars.items() if cid.startswith("char_")}
    pool = []
    # CN writes "\r\n" line ends and a literal backslash-n after the stars; EN plain newlines
    detail = g["recruitDetail"].replace("\r\n", "\n").replace("\\n", "\n")
    for stars, names in re.findall(r"\n(★+)\s*\n(.+?)(?=\n-{3,}|\Z)", detail, re.S):
        for name in re.sub(r"<[^>]+>", "", names).split("/"):
            cid = by_name.get(_name_key(name))
            if not cid:
                continue
            e, rarity = chars[cid], len(stars)
            ids = {CLASS_TAG_ID.get(e.get("profession")), POSITION_TAG_ID.get(e.get("position"))}
            ids |= {by_name_tag[t] for t in e.get("tagList") or [] if t in by_name_tag}
            ids |= {TOP} if rarity == 6 else {SENIOR} if rarity == 5 else set()
            sex = gender(cid)
            ids |= {MALE} if sex == "m" else {FEMALE} if sex == "f" else set()
            pool.append({"id": cid, "rarity": rarity, "tags": sorted(t for t in ids if t)})
    known = {t["id"] for t in tags}
    return {"tags": tags, "pool": [dict(p, tags=[t for t in p["tags"] if t in known]) for p in pool]}
