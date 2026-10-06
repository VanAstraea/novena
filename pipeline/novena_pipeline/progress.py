"""Story and events: what each part of the game pays out once, for the site's Story & events page.

Main story and supply stages pay Originite Prime on the first 3-star clear (stage_table's diamondOnceDrop) and a few
give an operator. Side Stories and Intermezzi live on in the archive (retro_table): unlocking one costs an Event
Crystal, and most have a trial (Record Restoration) whose stars, earned in the archive's stages, pay out the event's
operator and their full potential. Annihilation maps pay orundum once per kill milestone. Free ("welfare") operators
are gathered from all of these, plus event missions and milestones (activity_table), with where each one comes from.

    {"zones": [{"id", "kind": "main" | "supply", "name", "title", "op", "stages": [[stage id, code, flags]]}],
     "retros": [{"id", "kind": "side" | "intermezzo", "index", "name", "start", "acts": [event ids], "op", "stars",
                 "stages": [[stage id, code, flags]], "char": char id or null,
                 "trail": {"start", "rewards": [[reward id, stars, type, item id]]} or null}],
     "welfare": {char id: [{"kind": "retro", "id", "stars" (null: no trial yet)}
                           | {"kind": "event", "id", "name", "start", "end"}
                           | {"kind": "stage", "stage", "code", "retro"?}]},
     "annihilation": [{"id", "name", "region", "orundum", "rotation": [start, end] or null}],
     "crystal": {"cap": {player level: crystals}, "perWeek", "unlockCost"}}

Stage flags: 1 Originite Prime on the first 3-star clear, 2 challenge mode, 4 story only, 8 gives an operator,
16 counts towards the archive's trial. A trial counts 3 stars for each stage it lists cleared at 3 stars and 1 for
each challenge mode (story stages count for nothing, training stages aren't listed); that matches every trial's top
threshold. Stages with no flag (story-mode copies, side modes) are left out. Every date is ISO, in UTC.
"""

from __future__ import annotations

import urllib.error

from novena_pipeline import gamedata as gd
from novena_pipeline.upcoming import _iso

OP, CHALLENGE, STORY, CHAR, TRIAL = 1, 2, 4, 8, 16
CHALLENGE_DIFFICULTY = {"FOUR_STAR", "SIX_STAR"}  # "#f#" challenge modes, and the Intermezzi's "#s" ones
ORUNDUM = "4003"
EVERYONE_HAS = {"char_002_amiya"}  # given at the start: her stage "rewards" are story beats, not a way to get her


def table(name: str, server: str) -> dict | None:
    """A game table, or None when this server doesn't have it (that part of the file is left empty)."""
    try:
        return gd.table(name, server)
    except (urllib.error.URLError, OSError, ValueError):
        return None


def stage_chars(st: dict) -> list[str]:
    """Operators a stage gives once (on the first clear)."""
    drops = st.get("stageDropInfo") or {}
    out = []
    for e in (drops.get("displayDetailRewards") or []) + (drops.get("displayRewards") or []):
        if e.get("type") == "CHAR" and e.get("dropType") == "ONCE" and e["id"] not in out:
            out.append(e["id"])
    return out


def stage_flags(sid: str, st: dict, trail: set[str] | frozenset[str] = frozenset()) -> int:
    f = OP if st.get("diamondOnceDrop") else 0
    if st.get("difficulty") in CHALLENGE_DIFFICULTY:
        f |= CHALLENGE
    if st.get("isStoryOnly"):
        f |= STORY
    if any(c not in EVERYONE_HAS for c in stage_chars(st)):
        f |= CHAR
    if sid in trail and not st.get("isStoryOnly"):
        f |= TRIAL
    return f


def stage_stars(st: dict) -> int:
    """What a stage adds to an archive trial at its best: 3 stars, 1 for a challenge mode, none for a story."""
    if st.get("isStoryOnly"):
        return 0
    return 1 if st.get("difficulty") in CHALLENGE_DIFFICULTY else 3


def op_total(rows: list[list]) -> int:
    return sum(1 for _, _, f in rows if f & OP)


def zones(stage_table: dict, zone_table: dict) -> list[dict]:
    """Main story episodes, then the supply stages. The Intermezzi are in the mainline list too, but they're played
    from the archive, so they're counted there."""
    by_zone: dict[str, list[list]] = {}
    for sid, st in stage_table["stages"].items():
        if st.get("stageType") == "ACTIVITY":  # old mini-events filed under early episodes, no longer played
            continue
        f = stage_flags(sid, st)
        if f:
            by_zone.setdefault(st["zoneId"], []).append([sid, st.get("code") or sid, f])
    out = []
    all_zones = zone_table["zones"]
    main = [z for z in zone_table.get("mainlineZoneIdList") or [] if all_zones.get(z, {}).get("type") == "MAINLINE"]
    weekly = sorted((z for z, v in all_zones.items() if v.get("type") == "WEEKLY"), key=lambda z: int(z.rsplit("_", 1)[-1]))
    for kind, ids in (("main", main), ("supply", weekly)):
        for zid in ids:
            z, rows = all_zones[zid], by_zone.get(zid, [])
            if not rows:
                continue
            name = z.get("zoneNameFirst") if kind == "main" else z.get("zoneNameSecond")
            out.append({"id": zid, "kind": kind, "name": name or zid, "title": z.get("zoneNameSecond") if kind == "main" else None,
                        "op": op_total(rows), "stages": rows})
    return out


def mission_chars(activity_table: dict | None) -> dict[str, list[str]]:
    """Event id -> operators its missions or milestones give."""
    out: dict[str, list[str]] = {}
    if not activity_table:
        return out
    def add(act: str, item: dict) -> None:
        if act and item.get("type") == "CHAR" and item["id"] not in out.setdefault(act, []):
            out[act].append(item["id"])

    for m in activity_table.get("missionData") or []:
        for r in m.get("rewards") or []:
            add(m.get("missionGroup") or "", r)
    for acts in (activity_table.get("activity") or {}).values():  # the earliest events' token milestones
        for act, d in acts.items() if isinstance(acts, dict) else ():
            for m in (d.get("mileStoneItemList") or []) if isinstance(d, dict) else []:
                add(act, m.get("item") or {})
    return out


def retros(retro_table: dict, event_chars: dict[str, list[str]]) -> list[dict]:
    """Every archive, Intermezzi first, each with its stages, Originite Prime, trial and operator."""
    zone_to = retro_table.get("zoneToRetro") or {}
    stages_of: dict[str, list[tuple[str, dict]]] = {}
    for sid, st in (retro_table.get("stageList") or {}).items():
        rid = zone_to.get(st.get("zoneId"))
        if rid:
            stages_of.setdefault(rid, []).append((sid, st))
    trails = retro_table.get("retroTrailList") or {}
    out = []
    for rid, a in retro_table.get("retroActList", {}).items():
        trail = trails.get(rid) if a.get("haveTrail") else None
        counted = set(trail["stageList"]) if trail else set()
        rows = [[sid, st.get("code") or sid, f] for sid, st in stages_of.get(rid, []) if (f := stage_flags(sid, st, counted))]
        stage_by_id = dict(stages_of.get(rid, []))
        char = None
        if trail:
            rewards = [[r["trailRewardId"], r["starCount"], r["rewardItem"]["type"], r["rewardItem"]["id"]] for r in trail["trailRewardList"]]
            char = next((r[3] for r in rewards if r[2] == "CHAR"), None)
            trail_out = {"start": _iso(trail.get("trailStartTime") or a.get("trailStartTime") or 0), "rewards": rewards}
        else:
            trail_out = None
        if not char:  # no trial yet: the operator its events gave, if any
            char = next((c for act in a.get("linkedActId") or [] for c in event_chars.get(act, [])), None)
        out.append({"id": rid, "kind": "intermezzo" if a.get("type") == "BRANCHLINE" else "side", "index": a.get("index", 0),
                    "name": a.get("name") or rid, "start": _iso(a.get("startTime") or 0), "acts": a.get("linkedActId") or [],
                    "op": op_total(rows),
                    "stars": sum(stage_stars(stage_by_id[s]) for s in counted if s in stage_by_id) if trail else None,
                    "stages": rows, "char": char, "trail": trail_out})
    out.sort(key=lambda r: (r["kind"] != "intermezzo", r["index"]))
    return out


def welfare(zone_list: list[dict], retro_list: list[dict], event_chars: dict[str, list[str]], events: dict[str, dict],
            stages: dict[str, dict]) -> dict[str, list[dict]]:
    """Free operators and every way to get each: an archive trial, an event's missions or milestones (its latest
    event only), or a stage's first clear (main story or archive). `stages` looks up any stage by id."""
    out: dict[str, list[dict]] = {}

    def add(cid: str, src: dict) -> None:
        if cid not in EVERYONE_HAS and src not in out.setdefault(cid, []):
            out[cid].append(src)

    for r in retro_list:
        trail = r["trail"]
        for _, stars, typ, item in (trail["rewards"] if trail else []):
            if typ == "CHAR":
                add(item, {"kind": "retro", "id": r["id"], "stars": stars})
        if not trail and r["char"]:
            add(r["char"], {"kind": "retro", "id": r["id"], "stars": None})
    latest: dict[str, str] = {}
    for act, chars in event_chars.items():
        if act not in events:
            continue
        for cid in chars:
            if cid not in latest or events[act].get("startTime", 0) > events[latest[cid]].get("startTime", 0):
                latest[cid] = act
    for cid, act in latest.items():
        e = events[act]
        add(cid, {"kind": "event", "id": act, "name": e.get("name") or act, "start": _iso(e.get("startTime") or 0), "end": _iso(e.get("endTime") or 0)})
    for part, extra in [(z, {}) for z in zone_list] + [(r, {"retro": r["id"]}) for r in retro_list]:
        for sid, code, f in part["stages"]:
            for cid in stage_chars(stages.get(sid) or {}) if f & CHAR else []:
                add(cid, {"kind": "stage", "stage": sid, "code": code, **extra})
    return out


def annihilation(campaign_table: dict, stage_table: dict | None) -> list[dict]:
    """Each Annihilation map's one-time orundum (its kill milestones) and its latest rotation."""
    stages = (stage_table or {}).get("stages") or {}
    rotation: dict[str, list[str]] = {}
    for r in sorted(campaign_table.get("campaignRotateStageOpenTimes") or [], key=lambda r: r["startTs"]):
        rotation[r["stageId"]] = [_iso(r["startTs"]), _iso(r["endTs"])]
    out = []
    for cid, c in campaign_table.get("campaigns", {}).items():
        st = stages.get(cid) or {}
        orundum = sum(x.get("count", 0) for lad in c.get("breakLadders") or [] for x in lad.get("rewards") or [] if x.get("id") == ORUNDUM)
        out.append({"id": cid, "name": st.get("name") or cid, "region": st.get("code") or "", "orundum": orundum, "rotation": rotation.get(cid)})
    return out


def build(server: str) -> dict:
    stage_table, zone_table = table("stage_table", server), table("zone_table", server)
    retro_table, activity_table, campaign_table = table("retro_table", server), table("activity_table", server), table("campaign_table", server)
    zone_list = zones(stage_table, zone_table) if stage_table and zone_table else []
    event_chars = mission_chars(activity_table)
    retro_list = retros(retro_table, event_chars) if retro_table else []
    events = (activity_table or {}).get("basicInfo") or {}
    stages = {**((stage_table or {}).get("stages") or {}), **((retro_table or {}).get("stageList") or {})}
    welf = welfare(zone_list, retro_list, event_chars, events, stages)
    crystal = None
    if retro_table:
        crystal = {"cap": retro_table.get("retroCoinMaxOfLevels") or {}, "perWeek": retro_table.get("retroCoinPerWeek"),
                   "unlockCost": retro_table.get("retroUnlockCost")}
    return {"zones": zone_list, "retros": retro_list, "welfare": welf,
            "annihilation": annihilation(campaign_table, stage_table) if campaign_table else [], "crystal": crystal}
