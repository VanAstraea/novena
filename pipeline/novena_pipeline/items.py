"""Items, crafting recipes, material values and farmable stages for one server."""

from __future__ import annotations

import re
from typing import Any

from novena_pipeline import gamedata as gd
from novena_pipeline.sources import penguin, values as server_values
from novena_pipeline.text import plain

DUALCHIP = re.compile(r"^32\d3$")  # Dualchips are Factory recipes (2 Chip Packs + 1 Chip Catalyst), not Workshop
EXP_CARDS = {"2001": 200, "2002": 400, "2003": 1000, "2004": 2000}
CE_LMD = {"wk_melee_1": 1700, "wk_melee_2": 2800, "wk_melee_3": 4100, "wk_melee_4": 5700, "wk_melee_5": 7500, "wk_melee_6": 10000}
CE_SANITY = {"wk_melee_1": 10, "wk_melee_2": 15, "wk_melee_3": 20, "wk_melee_4": 25, "wk_melee_5": 30, "wk_melee_6": 36}


def recipes(server: str) -> dict[str, dict[str, Any]]:
    b = gd.table("building_data", server)
    out: dict[str, dict[str, Any]] = {}
    for f in b["workshopFormulas"].values():
        out.setdefault(f["itemId"], {"count": f["count"], "costs": [[c["id"], c["count"]] for c in f["costs"]],
                                     "lmd": f["goldCost"]})
    for f in b["manufactFormulas"].values():
        if DUALCHIP.match(f["itemId"]):
            out.setdefault(f["itemId"], {"count": f["count"], "costs": [[c["id"], c["count"]] for c in f["costs"]], "lmd": 0})
    return out


def group(item_id: str, e: dict) -> str:
    if item_id == "4001":
        return "lmd"
    if item_id in EXP_CARDS or item_id == "EXP":
        return "exp"
    if len(item_id) == 5 and item_id[:2] in ("30", "31") and item_id.isdigit():
        return "material"
    if re.match(r"^32\d\d$", item_id) or item_id == "3211":
        return "chip"
    if item_id in ("3301", "3302", "3303"):
        return "skill"
    if item_id.startswith("mod_"):
        return "module"
    return "other"


VOUCHERS = re.compile(r"^VOUCHER_(LEVELMAX|ELITE_II|SKILL_SPECIALLEVELMAX)_\d$")


def extras(server: str) -> set[str]:
    """Items the "Items to use" view names: training vouchers, class potential tokens and sanity potions."""
    t = gd.table("item_table", server)
    out = {iid for iid, e in t["items"].items() if isinstance(e.get("itemType"), str) and VOUCHERS.match(e["itemType"])}
    out |= {i for tier in (t.get("potentialItems") or {}).values() for i in tier.values()}
    out |= set(t.get("apSupplies") or {})
    return out


def potential_tokens(server: str) -> dict[str, dict[str, str]]:
    """Rarity (1-6) -> class -> its potential token ("tier5_sniper")."""
    return {str(int(r) + 1): tier for r, tier in (gd.table("item_table", server).get("potentialItems") or {}).items()}


def item_rows(server: str, wanted: set[str]) -> dict[str, dict[str, Any]]:
    here = gd.table("item_table", server)["items"]
    cn = gd.table("item_table", "cn")["items"]
    ap = gd.table("item_table", server).get("apSupplies") or {}
    out = {}
    for iid in sorted(wanted):
        e = here.get(iid) or cn.get(iid)
        if not e:
            continue
        out[iid] = {"name": e["name"], "rarity": gd.rarity(e), "icon": e.get("iconId") or iid,
                    "sort": e.get("sortId", 0), "group": group(iid, e), "desc": plain(e.get("usage") or e.get("description"))[:300]}
        if isinstance(e.get("itemType"), str) and e["itemType"] != "MATERIAL":
            out[iid]["type"] = e["itemType"]
        if iid in ap:
            out[iid]["ap"] = ap[iid]["ap"]
        if iid not in here:
            out[iid]["src"] = "cn"
    out["EXP"] = {"name": {"cn": "经验", "jp": "経験値", "kr": "경험치"}.get(server, "EXP"), "rarity": 4, "icon": "sprite_exp_card_t4",
                  "sort": 0, "group": "exp", "desc": "Operator EXP (Battle Records pool into this)"}
    return out


def open_days(server: str) -> dict[str, list[int]]:
    """Penguin stage id -> weekdays (1 = Monday) for stages that open on set days."""
    stages = gd.table("stage_table", server)["stages"]
    weekly = gd.table("zone_table", server).get("weeklyAdditionInfo") or {}
    out = {}
    for sid, st in stages.items():
        info = weekly.get(st.get("zoneId"))
        if info and info.get("daysOfWeek") and len(info["daysOfWeek"]) < 7:
            out[sid] = sorted(info["daysOfWeek"])
    return out


def supply_zones(server: str) -> list[dict[str, Any]]:
    """The supply and chip zones with their open days, for "open today"."""
    zones = gd.table("zone_table", server)
    weekly = zones.get("weeklyAdditionInfo") or {}
    stages = gd.table("stage_table", server)["stages"]
    codes: dict[str, list[str]] = {}
    for sid, st in stages.items():
        if st.get("zoneId") in weekly and st.get("code"):
            codes.setdefault(st["zoneId"], []).append(st["code"])
    out = []
    for zid, info in weekly.items():
        z = zones["zones"].get(zid) or {}
        cs = sorted(codes.get(zid, []))
        if not cs:
            continue
        prefix = cs[0].rsplit("-", 1)[0]
        out.append({"id": zid, "name": z.get("zoneNameSecond") or z.get("zoneNameFirst") or zid, "prefix": prefix,
                    "days": sorted(info.get("daysOfWeek") or []), "kind": info.get("type", "")})
    return sorted(out, key=lambda z: z["prefix"])


def stages_file(server: str, stages: list[penguin.Stage], fetched: float) -> dict[str, Any]:
    days = open_days(server)
    rows = []
    for s in sorted(stages, key=lambda s: s.stage_id):
        base = s.stage_id.removesuffix("_perm")
        row = {"id": s.stage_id, "code": s.code, "ap": s.sanity, "type": s.stage_type,
               "drops": {i: round(r, 5) for i, r in s.drops.items()}}
        if base in days:
            row["days"] = days[base]
        rows.append(row)
    ce_days = next((days[sid] for sid in CE_LMD if sid in days), None)
    ce = [{"id": sid, "code": f"CE-{sid[-1]}", "ap": CE_SANITY[sid], "lmd": lmd, **({"days": ce_days} if ce_days else {})}
          for sid, lmd in CE_LMD.items()]
    return {"region": penguin.REGION[server], "fetched": int(fetched * 1000), "stages": rows, "ce": ce,
            "zones": supply_zones(server)}


def values_file(server: str, yituliu_values: dict[str, float], stages: list[penguin.Stage], recs: dict) -> dict[str, Any]:
    items = gd.table("item_table", server)["items"]
    cn_items = gd.table("item_table", "cn")["items"]
    rarity = {i: gd.rarity(items.get(i) or cn_items.get(i)) for i in yituliu_values if (items.get(i) or cn_items.get(i))}
    fixes = server_values.server_corrections(yituliu_values, stages, recs, rarity) if stages else {}
    merged = {**yituliu_values, **{i: v for i, (v, _) in fixes.items()}}
    return {"values": {i: round(v, 4) for i, v in merged.items()},
            "corrections": {i: {"value": round(v, 2), "was": round(yituliu_values[i], 2), "why": why} for i, (v, why) in fixes.items()}}
