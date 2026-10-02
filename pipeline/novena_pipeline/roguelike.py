"""Integrated Strategies: the operators that carry each theme (ako's roguelike.py).

Community clear guides don't cover IS runs, so the signal is MAA's public IS data
(resource/roguelike/<theme>/recruitment.json, AGPL-3.0), used as data only and credited: per theme, the recruit
and promote priority MAA's maintainers give each operator, the skill it uses, and whether it's a key operator or
a good opener. Names are CN (some Latin), resolved to char ids here.
"""

from __future__ import annotations

from novena_pipeline import CACHE_DIR, gamedata as gd
from novena_pipeline.net import cached_json

MAA = "https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev/resource/roguelike/{}/recruitment.json"
THEMES = {"rogue_1": "Phantom", "rogue_2": "Mizuki", "rogue_3": "Sami", "rogue_4": "Sarkaz", "rogue_5": "JieGarden"}
MAX_AGE = 20 * 3600


def name_index(server: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for table_server in (server, "cn"):
        for cid, e in gd.table("character_table", table_server).items():
            if gd.is_playable(cid, e):
                for name in (e.get("appellation"), e.get("name")):
                    if name and name.strip():
                        out.setdefault(name.strip("“”\"").strip(), cid)
    return out


def picks(data: dict, names: dict[str, str]) -> list[dict]:
    out: dict[str, dict] = {}
    for group in data.get("priority") or []:
        for o in group.get("opers") or []:
            cid = names.get((o.get("name") or "").strip("“”\"").strip())
            if not cid:
                continue
            p = out.setdefault(cid, {"id": cid, "skill": 0, "key": False, "start": False, "recruit": 0, "promote": 0})
            if o.get("recruit_priority", 0) >= p["recruit"]:
                p["skill"] = o.get("skill") or p["skill"]
            p["recruit"] = max(p["recruit"], o.get("recruit_priority", 0))
            p["promote"] = max(p["promote"], o.get("promote_priority", 0))
            p["key"] |= bool(o.get("is_key"))
            p["start"] |= bool(o.get("is_start"))
    return sorted(out.values(), key=lambda p: (-p["recruit"], -p["promote"], p["id"]))


def theme_data(theme: str) -> dict:
    folder = THEMES[theme]
    ako_style = CACHE_DIR / "sources" / "maa_roguelike" / f"{folder}.json"
    return cached_json(ako_style, MAA.format(folder), MAX_AGE)


def build(server: str) -> dict:
    topics = gd.table("roguelike_topic_table", server).get("topics", {})
    names = name_index(server)
    themes = []
    for tid, t in topics.items():
        if tid not in THEMES:
            continue
        themes.append({"id": tid, "name": t.get("name", tid), "start": t.get("startTime", 0),
                       "picks": picks(theme_data(tid), names)})
    themes.sort(key=lambda t: -t["start"])
    return {"themes": themes}
