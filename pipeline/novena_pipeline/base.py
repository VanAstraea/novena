"""Base (RIIC) data for the site's optimizer (after ako's base.py), from MAA's curated infrast.json (AGPL-3.0, used as
data, credited) and the game's building_data.

    {"ops": {char id: [[[skill id, elite, level], ...] per base-skill slot]},
     "rooms": {facility: {"skills": {skill id: {product: value or "[NumOfPower]*5"}},
                          "groups": [{"desc", "conditions", "necessary": [[[skill ids], [char ids], {product: value}]],
                                      "optional": [...]}]}},
     "control": {skill id: {facility: percent per room}},
     "names": {skill id: name in the server's language}}

MAA scores each skill per facility and product, plus skill groups (Texas + Lappland and the like) whose value only
exists together. Control Center skills are only rated for morale there, so their unconditional base-wide buffs
("所有贸易站订单效率+7%") are read from MAA's Chinese descriptions; clauses starting 当/若/如果/每 depend on things this
model doesn't track and are skipped. Morale, faction buffs and dorms (ako has them) aren't modelled here.
"""

from __future__ import annotations

import re

from novena_pipeline import CACHE_DIR, gamedata as gd
from novena_pipeline.net import cached_json

MAA_URL = "https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev/resource/infrast.json"
FACILITIES = ("Trade", "Mfg", "Power", "Control", "Reception", "Office")
_CTRL_TARGETS = (("所有贸易站订单", "Trade"), ("所有制造站生产力", "Mfg"), ("会客室线索搜集速度", "Reception"), ("人脉资源的联络速度", "Office"))
_CONDITION = ("当", "若", "如果", "每")
_PCT = re.compile(r"\+([\d.]+)%")


def control_buffs(infrast: dict) -> dict[str, dict[str, float]]:
    out = {}
    for sid, skill in (infrast.get("Control") or {}).get("skills", {}).items():
        desc = (skill.get("desc") or [""])[0]
        if not desc.startswith("进驻控制中枢时，"):
            continue
        buffs = {}
        for clause in desc.removeprefix("进驻控制中枢时，").split("；"):
            if clause.startswith(_CONDITION):
                continue
            for opening, facility in _CTRL_TARGETS:
                if clause.startswith(opening) and (m := _PCT.search(clause)):
                    buffs[facility] = float(m.group(1))
        if buffs:
            out[sid] = buffs
    return out


def build(server: str) -> dict:
    infrast = cached_json(CACHE_DIR / "sources" / "maa_infrast.json", MAA_URL, 20 * 3600)
    b = gd.table("building_data", server)
    b_cn = gd.table("building_data", "cn")
    cn_ids = {e["name"]: cid for cid, e in gd.table("character_table", "cn").items() if gd.is_playable(cid, e)}
    ops = {}
    for cid, char in (b.get("chars") or {}).items():
        slots = []
        for slot in char.get("buffChar") or []:
            data = slot.get("buffData") or []
            if isinstance(data, dict):
                continue
            row = []
            for d in data:
                buff = b["buffs"].get(d["buffId"]) or b_cn["buffs"].get(d["buffId"]) or {}
                if buff.get("skillIcon"):
                    row.append([buff["skillIcon"], gd.phase(d["cond"]["phase"]), d["cond"].get("level", 1)])
            if row:
                slots.append(row)
        if slots:
            ops[cid] = slots
    names = {}
    for table in (b_cn, b):
        for buff in table["buffs"].values():
            if buff.get("skillIcon"):
                names[buff["skillIcon"]] = buff.get("buffName", buff["skillIcon"])

    def part(p: dict) -> list:
        return [list(p.get("skills") or []), [cn_ids[n] for n in p.get("filter") or [] if n in cn_ids], p.get("efficient") or {}]

    rooms = {}
    for fac in FACILITIES:
        f = infrast.get(fac) or {}
        rooms[fac] = {
            "skills": {sid: s.get("efficient") or {} for sid, s in (f.get("skills") or {}).items() if s.get("efficient")},
            "groups": [{"desc": g.get("desc", ""), "conditions": g.get("conditions") or {},
                        "necessary": [part(p) for p in g.get("necessary") or []],
                        "optional": [part(p) for p in g.get("optional") or []]} for g in f.get("skillsGroup") or []],
            "products": list((f.get("products") or {}).keys()) if isinstance(f.get("products"), dict) else f.get("products") or [],
        }
    return {"ops": ops, "rooms": rooms, "control": control_buffs(infrast), "names": names}
