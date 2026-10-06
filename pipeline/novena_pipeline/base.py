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
model doesn't track and are skipped.

Also, after ako's base.py and training.py:
     "morale": {facility: {skill id: [own, room, working]}}  morale per hour: the holder's own drain change, everyone in
               the room's, and (Control Center) recovery for everyone working elsewhere; from MAA's descriptions
     "dorm":   {skill id: [everyone, one, own, per dorm level]}  morale per hour a dorm skill adds
     "train":  {skill id: [speed %, [classes] (empty: all), branch or null, mastery level or null, extra %]}
     "workshop": {skill id: [materials, byproduct rate %]}
     "layout": {"rows", "cols", "slots": {slot id: [row, col, height, width, floor]},
                "passages": [[row, col, height, width(, 1 in the annex)]], "annex": [slot ids], "capacity": {room: [per level]}}
               the base's slot grid from building_data, rows flipped so the top floor comes first, for the base map
Training and Workshop skills aren't in MAA's data, so they're read from the game's English descriptions (skill ids
are the same on every server). Left out: conditional morale effects, faction-counting skills, and the Training Room
skills that depend on who else is in the base or stored-up effects.
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

# "<who> morale per hour consumption|recovery +x": the clause before it names who it applies to.
_MORALE = re.compile(r"([^，；。]*?)心情每小时(消耗|恢复)([+-][\d.]+)")
_DORM = [re.compile(r"该宿舍内(?:除自身以外)?所有干员的?心情每小时恢复\+([\d.]+)"), re.compile(r"某个干员每小时恢复\+([\d.]+)"),
         re.compile(r"^进驻宿舍时，自身心情每小时恢复\+([\d.]+)"), re.compile(r"当前宿舍每级为恢复效果额外\+([\d.]+)")]

PROFESSIONS = {"Caster": "CASTER", "Guard": "WARRIOR", "Defender": "TANK", "Medic": "MEDIC", "Sniper": "SNIPER",
               "Specialist": "SPECIAL", "Supporter": "SUPPORT", "Vanguard": "PIONEER"}
_CLASSES = "|".join(PROFESSIONS)
_SPEED = [re.compile(rf"((?:{_CLASSES})(?: and (?:{_CLASSES}))?) Operators' Specialization training speed ?\+(\d+)%"),
          re.compile(rf"training speed of ((?:{_CLASSES})(?: and (?:{_CLASSES}))?) Operators by \+(\d+)%"),
          re.compile(r"(), Operators' Specialization training speed \+(\d+)%$")]
_BRANCH = re.compile(r"if the trainee's Job Branch is ([\w ]+?), training speed will be further increased by \+(\d+)%")
_LEVEL = [re.compile(r"if training (?:this|a|the) skill to Specialization Level (\d), training speed will be (?:further )?"
                     r"increased by \+(\d+)%"),
          re.compile(r"further increases this speed by \+(\d+)% if training the skill to Specialization Level (\d)")]
_FACTION = re.compile(r"for each [\w ]+? Operator in the Base")
_BYPRODUCT = re.compile(r"Workshop to process (.+?)(?:,| the corresponding).*?byproduct[^%]*?(\d+)%|"
                        r"Workshop to process (.+?), the production rate of byproduct increases by (\d+)%")


def morale_effects(infrast: dict) -> dict[str, dict[str, list[float]]]:
    out: dict[str, dict[str, list[float]]] = {}
    for facility in FACILITIES:
        for sid, skill in (infrast.get(facility) or {}).get("skills", {}).items():
            own = room = working = 0.0
            for who, kind, amount in _MORALE.findall((skill.get("desc") or [""])[0]):
                drain = float(amount) if kind == "消耗" else -float(amount)
                who = who.removeprefix("进驻控制中枢时，")
                if who in ("", "自身"):
                    own += drain
                elif who.endswith("其他设施内处于工作状态的干员") and drain < 0:
                    working = max(working, -drain)
                elif ("所有干员" in who or "其余干员" in who or who.endswith("内干员")) and not any(w in who for w in ("可使", "宿舍", "设施", "每个")):
                    room += drain
            if own or room or working:
                out.setdefault(facility, {})[sid] = [round(own, 3), round(room, 3), round(working, 3)]
    return out


def dorm_effects(infrast: dict) -> dict[str, list[float]]:
    out = {}
    for sid, skill in (infrast.get("Dorm") or {}).get("skills", {}).items():
        desc = (skill.get("desc") or [""])[0]
        fx = [float(m.group(1)) if (m := rx.search(desc)) else 0.0 for rx in _DORM]
        if any(fx):
            out[sid] = fx
    return out


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


def parse_trainer(desc: str, branches: dict[str, str]) -> list | None:
    """One Training Room skill, or None if it doesn't speed training in a way the site models."""
    desc = _clean(desc)
    if "Trainer" not in desc or _FACTION.search(desc):
        return None
    speed, classes = 0.0, []
    for rx in _SPEED:
        if m := rx.search(desc):
            speed = float(m.group(2))
            classes = sorted(PROFESSIONS[c] for c in m.group(1).split(" and ") if c)
            break
    branch = level = None
    extra = 0.0
    if m := _BRANCH.search(desc):
        branch, extra = branches.get(m.group(1)), float(m.group(2))
    elif m := _LEVEL[0].search(desc):
        level, extra = int(m.group(1)), float(m.group(2))
    elif m := _LEVEL[1].search(desc):
        level, extra = int(m.group(2)), float(m.group(1))
    if not speed and not extra:
        return None
    return [speed, classes, branch, level, extra]


def parse_workshop(desc: str) -> list | None:
    """One Workshop skill as [materials, byproduct rate %], or None if it doesn't raise the byproduct rate."""
    m = _BYPRODUCT.search(_clean(desc))
    if not m:
        return None
    scope, pct = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
    scope = re.sub(r"(?i)-type| materials?$", "", scope.strip()).strip()
    if scope.lower().startswith("any"):
        scope = "Any material"
    elif scope.lower().startswith("elite"):
        scope = "Elite materials" + (" (2-morale recipes)" if "Morale cost of 2" in scope else "")
    return [scope, float(pct)]


def training_workshop() -> tuple[dict, dict]:
    """Keyed by skill icon (the id the rest of this file uses), read from the English table."""
    en = gd.table("building_data", "en")["buffs"]
    branches = {v.get("subProfessionName"): k for k, v in (gd.table("uniequip_table", "en").get("subProfDict") or {}).items()}
    train, workshop = {}, {}
    for b in en.values():
        icon = b.get("skillIcon")
        if not icon:
            continue
        if b.get("roomType") == "TRAINING" and (fx := parse_trainer(b.get("description"), branches)):
            train[icon] = fx
        elif b.get("roomType") == "WORKSHOP" and (fx := parse_workshop(b.get("description"))):
            workshop[icon] = fx
    return train, workshop


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


PASSAGES = ("ELEVATOR", "CORRIDOR")
_ROOMS = ("CONTROL", "POWER", "MANUFACTURE", "TRADING", "DORMITORY", "WORKSHOP", "HIRE", "TRAINING", "MEETING")


def layout(b: dict) -> dict:
    """Where each slot of the base sits (building_data's layouts.v0), for drawing a synced base like the game's screen.

    The game counts rows from the bottom; they're flipped here so the top floor (the Control Center's) is row 0.
    Elevators and corridors hold no one, so they're kept apart as passages. Slots whose costs end in "_P" are the
    annex to the right of the main base; its passages are marked so the map can leave them out when nothing is built
    there. "capacity" is how many operators each kind of room holds at each level."""
    slots = ((b.get("layouts") or {}).get("v0") or {}).get("slots") or {}
    height = max((g["offset"]["row"] + g["size"]["row"] for g in slots.values()), default=0)
    out: dict = {"rows": height, "cols": max((g["offset"]["col"] + g["size"]["col"] for g in slots.values()), default=0),
                 "slots": {}, "passages": [], "annex": []}
    for sid, g in slots.items():
        place = [height - g["offset"]["row"] - g["size"]["row"], g["offset"]["col"], g["size"]["row"], g["size"]["col"]]
        annex = str(g.get("cleanCostId") or "").endswith("_P")
        if g.get("category") in PASSAGES:
            out["passages"].append(place + [1] if annex else place)
        else:
            out["slots"][sid] = place + [g.get("storeyId") or ""]
            if annex:
                out["annex"].append(sid)
    out["capacity"] = {k: [p.get("maxStationedNum", 0) for p in r.get("phases") or []] for k, r in (b.get("rooms") or {}).items() if k in _ROOMS}
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
    train, workshop = training_workshop()
    formulas = {k: f.get("itemId") for k, f in (b.get("manufactFormulas") or {}).items() if f.get("itemId")}  # what a factory makes
    return {"ops": ops, "rooms": rooms, "control": control_buffs(infrast), "names": names,
            "morale": morale_effects(infrast), "dorm": dorm_effects(infrast), "train": train, "workshop": workshop, "formulas": formulas,
            "layout": layout(b)}
