"""Operators: the index every page searches, and one detail file per operator with everything its pages show.

Every operator CN has is listed on every server. One the server doesn't have yet keeps CN's name and text and is
marked `src: "cn"` (the site labels it "CN only"); `on` lists the servers that have it.
"""

from __future__ import annotations

import re
from typing import Any

from novena_pipeline import SERVERS, gamedata as gd
from novena_pipeline.text import blackboard, fill, markup

STAT_KEYS = {"maxHp": "hp", "atk": "atk", "def": "def", "magicResistance": "res", "cost": "cost", "blockCnt": "block",
             "baseAttackTime": "interval", "respawnTime": "respawn", "attackSpeed": "aspd"}
# potential and module attribute names -> the same short keys
ATTR = {"MAX_HP": "hp", "ATK": "atk", "DEF": "def", "MAGIC_RESISTANCE": "res", "COST": "cost", "BLOCK_CNT": "block",
        "ATTACK_SPEED": "aspd", "RESPAWN_TIME": "respawn", "BASE_ATTACK_TIME": "interval",
        0: "hp", 1: "atk", 2: "def", 3: "res", 4: "cost", 5: "block", 7: "aspd", 21: "respawn"}
BB_ATTR = {"max_hp": "hp", "atk": "atk", "def": "def", "magic_resistance": "res", "cost": "cost", "block_cnt": "block",
           "attack_speed": "aspd", "respawn_time": "respawn", "base_attack_time": "interval"}
OBTAIN = {"招募寻访": "headhunt", "招募寻访、见习任务": "headhunt", "活动获得": "event", "凭证交易所": "voucher",
          "集成战略获得": "is", "信用交易所": "credit", "限时礼包": "pack", "主题曲剧情": "story", "周年奖励": "anniversary"}
SP_TYPE = {"INCREASE_WITH_TIME": "auto", "INCREASE_WHEN_ATTACK": "offensive", "INCREASE_WHEN_TAKEN_DAMAGE": "defensive",
           8: "passive", 1: "auto", 2: "offensive", 4: "defensive"}
_GENDER = re.compile(r"(?:【性别】|\[Gender\])\s*(\S+)")


def items(entries: list[dict] | None) -> list[list]:
    return [[e["id"], e["count"]] for e in entries or [] if e.get("count")]


def _stats(data: dict) -> dict[str, float]:
    return {short: data[key] for key, short in STAT_KEYS.items() if key in data}


def _mods(rank: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    attrs = ((rank.get("buff") or {}).get("attributes") or {}).get("attributeModifiers") or []
    for m in attrs:
        key = ATTR.get(m.get("attributeType"))
        if key:
            out[key] = out.get(key, 0) + m.get("value", 0)
    return out


def gender(cid: str) -> str | None:
    for server in ("cn", "en"):
        entry = gd.table("handbook_info_table", server)["handbookDict"].get(cid)
        if not entry:
            continue
        for story in entry.get("storyTextAudio") or []:
            for s in story.get("stories") or []:
                m = _GENDER.search(s.get("storyText") or "")
                if m:
                    g = m.group(1)
                    if g in ("男", "Male"):
                        return "m"
                    if g in ("女", "Female"):
                        return "f"
                    return None
    return None


def limited(cid: str) -> bool:
    entry = gd.table("handbook_info_table", "cn")["handbookDict"].get(cid) or {}
    return bool(entry.get("isLimited"))


def alter_groups() -> dict[str, list[str]]:
    """char id -> every form in its group (the base operator and its alters), from CN's char_meta_table."""
    out = {}
    for base, members in (gd.table("char_meta_table", "cn").get("spCharGroups") or {}).items():
        group = [base] + [m for m in members if m != base]
        if len(group) > 1:
            for m in group:
                out[m] = group
    return out


def faction_names(server: str) -> dict[str, str]:
    names = {k: v.get("powerName", k) for k, v in gd.table("handbook_team_table", "cn").items()}
    if server != "cn":
        names.update({k: v.get("powerName", k) for k, v in gd.table("handbook_team_table", server).items()})
    return names


def branch_names(server: str) -> dict[str, str]:
    out = {k: v["subProfessionName"] for k, v in gd.table("uniequip_table", "cn")["subProfDict"].items()}
    if server != "cn":
        out.update({k: v["subProfessionName"] for k, v in gd.table("uniequip_table", server)["subProfDict"].items()})
    return out


class Builder:
    """Builds the operator files for one server."""

    def __init__(self, server: str, recruitable: set[str], ranges: set[str]):
        self.server = server
        self.recruitable = recruitable
        self.ranges = ranges  # range ids used, collected for ranges.json
        self.here = gd.chars(server)
        self.cn = gd.chars("cn")
        self.on = {s: set(gd.chars(s)) for s in SERVERS}
        self.alters = alter_groups()
        self.factions = faction_names(server)
        self.branches = branch_names(server)

    def ids(self) -> list[str]:
        return sorted(self.here.keys() | self.cn.keys())

    def src(self, cid: str) -> str:
        return self.server if cid in self.here else "cn"

    def entry(self, cid: str) -> dict:
        return self.here.get(cid) or self.cn[cid]

    def index_row(self, cid: str) -> dict[str, Any]:
        e, src = self.entry(cid), self.src(cid)
        cn_entry = self.cn.get(cid)
        name = e["name"]
        if gd.is_patch(cid, src):
            name = f"{name} ({gd.PATCH_PROFESSION.get(e['profession'], e['profession'])})"
        modules = [m for m in gd.table("uniequip_table", src)["charEquip"].get(cid, [])
                   if gd.table("uniequip_table", src)["equipDict"][m].get("type") != "INITIAL"]
        row = {
            "id": cid, "name": name, "rarity": gd.rarity(e), "cls": e["profession"], "branch": e.get("subProfessionId"),
            "pos": e.get("position"), "tags": e.get("tagList") or [],
            "factions": [f for f in dict.fromkeys([e.get("nationId"), e.get("groupId"), e.get("teamId")]) if f],
            "obtain": "limited" if limited(cid) else OBTAIN.get((cn_entry or e).get("itemObtainApproach") or "", "other"),
            "recruit": cid in self.recruitable, "on": [s for s in SERVERS if cid in self.on[s]],
            "mods": [gd.table("uniequip_table", src)["equipDict"][m]["typeIcon"].rsplit("-", 1)[-1].upper() for m in modules],
            "modIds": modules,
        }
        if src != self.server:
            row["src"] = src
        if cn_entry and cn_entry["name"] != name:
            row["cn"] = cn_entry["name"]
        if e.get("appellation", "").strip() and e["appellation"].strip() != name:
            row["alt"] = e["appellation"].strip()
        if g := gender(cid):
            row["g"] = g
        if cid in self.alters:
            row["alters"] = [a for a in self.alters[cid] if a != cid]
        if gd.is_patch(cid, src):
            row["patch"] = True
        return row

    def detail(self, cid: str) -> dict[str, Any]:
        e, src = self.entry(cid), self.src(cid)
        rarity = gd.rarity(e)
        const = gd.table("gamedata_const", src)
        gold = const["evolveGoldCost"][rarity - 1]
        phases = []
        for i, p in enumerate(e["phases"]):
            frames = p["attributesKeyFrames"]
            self.ranges.add(p.get("rangeId") or "")
            phases.append({"max": p["maxLevel"], "range": p.get("rangeId"), "lo": _stats(frames[0]["data"]),
                           "hi": _stats(frames[-1]["data"]), "cost": items(p.get("evolveCost")),
                           "lmd": gold[i - 1] if i and gold and gold[i - 1] > 0 else 0})
        trust = {k: v for k, v in _stats((e.get("favorKeyFrames") or [{}])[-1].get("data", {})).items()
                 if k in ("hp", "atk", "def", "res") and v}
        out: dict[str, Any] = {
            "id": cid, "src": src, "desc": markup(e.get("description")), "trait": self._trait(e),
            "phases": phases, "trust": trust,
            "pots": [{"desc": r.get("description", ""), "mods": _mods(r)} for r in e.get("potentialRanks") or []],
            "talents": self._talents(e),
            "skills": [self._skill(s, src) for s in e.get("skills") or [] if s.get("skillId")],
            "skillUp": [items(s.get("lvlUpCost")) for s in e.get("allSkillLvlup") or []],
            "modules": self._modules(cid, src),
            "riic": self._riic(cid, src),
        }
        return out

    def _trait(self, e: dict) -> list[dict] | None:
        cands = ((e.get("trait") or {}).get("candidates")) or []
        out = []
        for c in cands:
            desc = c.get("overrideDescripton")
            if desc:
                out.append({"elite": gd.phase(c["unlockCondition"]["phase"]), "pot": c.get("requiredPotentialRank", 0),
                            "desc": markup(fill(desc, blackboard(c.get("blackboard"))))})
        return out or None

    def _talents(self, e: dict) -> list[list[dict]]:
        out = []
        for t in e.get("talents") or []:
            cands = []
            for c in t.get("candidates") or []:
                if c.get("isHideTalent") or not c.get("description"):
                    continue
                if c.get("rangeId"):
                    self.ranges.add(c["rangeId"])
                cands.append({"name": c.get("name") or "", "elite": gd.phase(c["unlockCondition"]["phase"]),
                              "level": c["unlockCondition"].get("level", 1), "pot": c.get("requiredPotentialRank", 0),
                              "desc": markup(fill(c["description"], blackboard(c.get("blackboard")))),
                              **({"range": c["rangeId"]} if c.get("rangeId") else {})})
            if cands:
                out.append(cands)
        return out

    def _skill(self, s: dict, src: str) -> dict[str, Any]:
        sk = gd.table("skill_table", src).get(s["skillId"]) or gd.table("skill_table", "cn").get(s["skillId"]) or {}
        levels = []
        for lv in sk.get("levels") or []:
            bb = blackboard(lv.get("blackboard"))
            bb.setdefault("duration", lv.get("duration"))
            sp = lv.get("spData") or {}
            if lv.get("rangeId"):
                self.ranges.add(lv["rangeId"])
            levels.append({"desc": markup(fill(lv.get("description") or "", bb)), "sp": sp.get("spCost", 0),
                           "init": sp.get("initSp", 0), "dur": lv.get("duration", 0),
                           **({"range": lv["rangeId"]} if lv.get("rangeId") else {})})
        first = (sk.get("levels") or [{}])[0]
        return {
            "id": s["skillId"], "icon": sk.get("iconId") or s["skillId"], "name": first.get("name", s["skillId"]),
            "sp": SP_TYPE.get((first.get("spData") or {}).get("spType"), "auto"),
            "type": str(first.get("skillType", "")).lower(), "ammo": first.get("durationType") == "AMMO",
            "levels": levels,
            "mastery": [{"cost": items(m.get("levelUpCost")), "hours": round((m.get("lvlUpTime") or 0) / 3600)}
                        for m in s.get("levelUpCostCond") or []],
        }

    def _modules(self, cid: str, src: str) -> list[dict]:
        table = gd.table("uniequip_table", src)
        battle = gd.table("battle_equip_table", src)
        out = []
        for mid in table["charEquip"].get(cid, []):
            m = table["equipDict"][mid]
            if m.get("type") == "INITIAL":
                continue
            stages = []
            for ph in (battle.get(mid) or {}).get("phases") or []:
                attrs = {}
                for b in ph.get("attributeBlackboard") or []:
                    if b["key"] in BB_ATTR:
                        attrs[BB_ATTR[b["key"]]] = b["value"]
                traits, talents = [], []
                for part in ph.get("parts") or []:
                    for c in ((part.get("overrideTraitDataBundle") or {}).get("candidates") or [])[:1]:
                        d = c.get("additionalDescription") or c.get("overrideDescripton")
                        if d:
                            traits.append(markup(fill(d, blackboard(c.get("blackboard")))))
                    seen = set()
                    for c in (part.get("addOrOverrideTalentDataBundle") or {}).get("candidates") or []:
                        if c.get("isHideTalent") or c.get("requiredPotentialRank", 0) or c.get("talentIndex", -1) in seen:
                            continue
                        seen.add(c.get("talentIndex", -1))
                        d = c.get("upgradeDescription") or c.get("description")
                        if d:
                            talents.append({"name": c.get("name") or "", "desc": markup(fill(d, blackboard(c.get("blackboard"))))})
                stages.append({"attrs": attrs, "trait": traits, "talents": talents})
            cost = m.get("itemCost") or {}
            out.append({
                "id": mid, "name": m.get("uniEquipName", mid), "letter": m["typeIcon"].rsplit("-", 1)[-1].upper(),
                "icon": m["typeIcon"].upper(), "unlock": {"elite": gd.phase(m.get("unlockEvolvePhase", 2)),
                                                          "level": m.get("unlockLevel", 1)},
                "stages": stages, "cost": [items(cost.get(str(i))) for i in (1, 2, 3)],
            })
        return out

    def _riic(self, cid: str, src: str) -> list[dict]:
        b = gd.table("building_data", src)
        out = []
        for slot in (b["chars"].get(cid) or {}).get("buffChar") or []:
            data = slot.get("buffData") or []
            if isinstance(data, dict):  # an empty slot is {} in the table
                continue
            for d in data:
                buff = b["buffs"].get(d["buffId"])
                if not buff:
                    continue
                out.append({"name": buff.get("buffName", ""), "desc": markup(buff.get("description")),
                            "room": buff.get("roomType", ""), "icon": buff.get("skillIcon", ""),
                            "elite": gd.phase(d["cond"]["phase"]), "level": d["cond"].get("level", 1)})
        return out


def ranges(server: str, used: set[str]) -> dict[str, list[list[int]]]:
    table = dict(gd.table("range_table", "cn"))
    if server != "cn":
        table.update(gd.table("range_table", server))
    return {rid: [[g["row"], g["col"]] for g in table[rid]["grids"]] for rid in sorted(used) if rid in table}


def terms(server: str) -> dict[str, dict[str, str]]:
    table = dict(gd.table("gamedata_const", "cn")["termDescriptionDict"])
    if server != "cn":
        table.update(gd.table("gamedata_const", server)["termDescriptionDict"])
    return {k: {"name": v.get("termName", k), "desc": markup(v.get("description"))} for k, v in table.items()}


def const(server: str) -> dict[str, Any]:
    c = gd.table("gamedata_const", server)
    return {"expMap": c["characterExpMap"], "lmdMap": c["characterUpgradeCostMap"], "evolveGold": c["evolveGoldCost"],
            "maxLevel": c["maxLevel"]}
