"""Upcoming content: what CN has that this server hasn't had yet, with estimated dates (ako's upcoming.py, cc.py and
pulls.py banners).

Event ids are shared, so the lag is the median gap over the most recent events both servers ran; each CN event
this server hasn't had gets CN's start plus that lag. An event the server's own table lists with a future start is
"announced", with its real date and name. Contingency Contract seasons are matched the same way. Banners are CN's
that name a featured 6-star (limited, collaboration, special, Kernel). Every date is an estimate: servers skip and
reorder events (collaborations especially).
"""

from __future__ import annotations

import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone

from novena_pipeline import gamedata as gd
from novena_pipeline.sources import copilot
from novena_pipeline.usage import StageIndex, ids_by_cn_name, stage_presence

RECENT_EVENTS = 8
DAY = 86400
BANNER_KINDS = {"LIMITED": "limited", "LINKAGE": "collab", "SPECIAL": "special", "CLASSIC": "kernel", "CLASSIC_DOUBLE": "kernel"}


def event_stages(server: str) -> dict[str, set[str]]:
    acts = gd.table("activity_table", server)["zoneToActivity"]
    out: dict[str, set[str]] = defaultdict(set)
    for sid, st in gd.table("stage_table", server)["stages"].items():
        act = acts.get(st["zoneId"])
        if act and st["stageType"] == "ACTIVITY":
            out[act].add(sid)
    return out


def lag(server: str) -> tuple[float, float]:
    """(median lag in seconds over recent shared events, latest shared CN start)."""
    cn = gd.table("activity_table", "cn")["basicInfo"]
    here = gd.table("activity_table", server)["basicInfo"]
    with_stages = event_stages("cn")
    shared = sorted((cn[a]["startTime"], here[a]["startTime"]) for a in cn
                    if a in here and with_stages.get(a) and not cn[a].get("isReplicate") and not here[a].get("isReplicate"))
    recent = shared[-RECENT_EVENTS:]
    if not recent:
        return 0.0, 0.0
    return statistics.median(g - c for c, g in recent), shared[-1][0]


def featured(pool: dict) -> list[str]:
    rule, meta = pool.get("gachaRuleType"), pool.get("dynMeta") or {}
    if rule == "LIMITED":
        return [c for c in [(pool.get("limitParam") or {}).get("limitedCharId")] if c]
    if rule == "LINKAGE":
        return [c for c in [(pool.get("linkageParam") or {}).get("guaranteeTarget6Char")] if c]
    if rule == "SPECIAL":
        return list((meta.get("rarityPickCharDict") or {}).get("TIER_6") or [])
    if rule in ("CLASSIC", "CLASSIC_DOUBLE"):
        return [c for c in (meta.get("main6RarityCharId"), meta.get("sub6RarityCharId")) if c]
    return []


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def build(server: str, jobs: list[copilot.Job], usage_ops: dict, now: float | None = None) -> dict:
    now = now or time.time()
    out: dict = {"server": server, "lag_days": None, "events": [], "running": [], "operators": [], "modules": [],
                 "banners": [], "cc": None}
    here_acts = gd.table("activity_table", server)["basicInfo"]
    here_stages = event_stages(server)
    out["running"] = sorted(({"id": a, "name": i["name"], "start": _iso(i["startTime"]), "end": _iso(i["endTime"])}
                             for a, i in here_acts.items()
                             if here_stages.get(a) and i["startTime"] <= now < i["endTime"]), key=lambda e: e["end"])
    if server == "cn":
        return out  # CN is the preview for everyone else
    delay, last_shared = lag(server)
    out["lag_days"] = round(delay / DAY)
    stage_index, names = StageIndex(), ids_by_cn_name()
    cn_acts = gd.table("activity_table", "cn")["basicInfo"]
    cn_stages = event_stages("cn")
    for act_id, info in cn_acts.items():
        if not cn_stages.get(act_id) or info.get("isReplicate"):
            continue
        if act_id in here_acts and here_acts[act_id]["startTime"] <= now:
            continue
        if info["startTime"] < last_shared - 30 * DAY:
            continue
        ev = {"id": act_id, "name_cn": info["name"], "kind": info.get("type", ""), "cn_start": _iso(info["startTime"]),
              "eta": _iso(info["startTime"] + delay), "confirmed": False}
        if act_id in here_acts:
            ev.update(eta=_iso(here_acts[act_id]["startTime"]), name=here_acts[act_id]["name"], confirmed=True)
        ops, guides, guided = stage_presence(jobs, cn_stages[act_id], stage_index, names)
        ev.update(stages=len(cn_stages[act_id]), guided=guided, guides=guides, key_ops=ops)
        out["events"].append(ev)
    out["events"].sort(key=lambda e: e["cn_start"])

    here_chars, cn_chars = gd.table("character_table", server), gd.table("character_table", "cn")
    only = [cid for cid, e in cn_chars.items() if gd.is_playable(cid, e) and cid not in here_chars]
    out["operators"] = sorted(only, key=lambda c: -(usage_ops.get(c, {}).get("score") or 0))

    cn_equip, here_equip = gd.table("uniequip_table", "cn"), gd.table("uniequip_table", server)["equipDict"]
    for cid, mids in cn_equip["charEquip"].items():
        if cid not in here_chars:
            continue
        for mid in mids:
            m = cn_equip["equipDict"][mid]
            if mid in here_equip or m.get("type") == "INITIAL":
                continue
            out["modules"].append({"char": cid, "id": mid, "letter": m["typeIcon"].rsplit("-", 1)[-1].upper(),
                                   "icon": m["typeIcon"].upper(), "name_cn": m.get("uniEquipName", mid),
                                   "cn_start": _iso(m.get("uniEquipGetTime") or 0),
                                   "eta": _iso((m.get("uniEquipGetTime") or 0) + delay)})

    pools, here_pools = gd.table("gacha_table", "cn")["gachaPoolClient"], gd.table("gacha_table", server)["gachaPoolClient"]
    ran_here = {c for p in here_pools for c in featured(p)}
    for p in pools:
        chars = featured(p)
        rule = p.get("gachaRuleType")
        if not chars or rule not in BANNER_KINDS:
            continue
        eta = p["openTime"] + delay
        if not now - 14 * DAY <= eta <= now + 200 * DAY:
            continue
        if rule in ("LIMITED", "LINKAGE") and all(c in ran_here for c in chars):
            continue
        out["banners"].append({"id": p["gachaPoolId"], "name_cn": p.get("gachaPoolName") or "", "kind": BANNER_KINDS[rule],
                               "cn_open": _iso(p["openTime"]), "eta": _iso(eta), "featured": chars,
                               **({"spark": 300} if rule == "LIMITED" else {})})
    out["banners"].sort(key=lambda b: b["eta"])
    out["cc"] = cc_schedule(server, now)
    return out


def cc_schedule(server: str, now: float) -> dict:
    here = gd.table("crisis_v2_table", server).get("seasonInfoDataMap") or {}
    cn = gd.table("crisis_v2_table", "cn").get("seasonInfoDataMap") or {}
    lags = [(here[k]["startTs"] - cn[k]["startTs"]) / DAY for k in sorted(here, key=lambda k: here[k]["startTs"]) if k in cn]
    lag_days = statistics.median(lags[-3:]) if lags else None
    history = sorted(({"id": k, "name": v.get("name", k), "start": _iso(v["startTs"]), "end": _iso(v["endTs"])}
                      for k, v in here.items()), key=lambda s: s["start"], reverse=True)
    current = next((s for k, s in ((s["id"], s) for s in history)
                    if here[k]["startTs"] <= now <= here[k]["endTs"]), None)
    coming = sorted((k for k in cn if k not in here), key=lambda k: cn[k]["startTs"])
    nxt = None
    if coming and lag_days is not None:
        k = coming[0]
        eta = cn[k]["startTs"] + lag_days * DAY
        nxt = {"id": k, "name_cn": cn[k].get("name", k), "cn_start": _iso(cn[k]["startTs"]), "eta": _iso(eta),
               "overdue": eta < now}
    return {"history": history[:12], "current": current, "next": nxt,
            "lag_days": round(lag_days) if lag_days is not None else None}
