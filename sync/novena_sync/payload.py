"""What leaves the game data: only what Novena uses.

The game's sync data holds far more than a roster (your nickname, friends, mail, purchase history, every stage
cleared). Before anything is saved or sent, it's cut down to operators, the depot, the currencies the pull planner
counts, and consumables (training vouchers, sanity potions: how many and when they expire). The result is still shaped like sync data, so Novena reads it with the importer it already has.

Version 2 adds, each checked for what it reveals (nothing that identifies the player or anyone else):
- the outfit each operator wears (an outfit id, only when it isn't the default art);
- recruitment slots: the tags offered, the tags picked, and when the recruitment started and finishes;
- the base: each room's type, level and team (operator ids and their morale), what a factory makes and how full it
  is, a trading post's order count and limit, a dorm's ambience, the drones; and when each room's work completes;
- sanity: the amount, the cap and when it was last counted, so Novena can tell when it's full.
Never kept: names, ids, friends, the base's visitors or clues, messages, purchases, or anything else.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP = "novena-sync"
STATUS_KEYS = ("gold", "diamondShard", "freeDiamond", "payDiamond", "gachaTicket", "tenGachaTicket", "monthlySubscriptionEndTime",
               "ap", "maxAp", "lastApAddTime")
MORALE_UNIT = 360_000  # the game counts morale in these: 24 morale = 8,640,000
ROOMS = {"CONTROL", "POWER", "MANUFACTURE", "TRADING", "DORMITORY", "WORKSHOP", "HIRE", "TRAINING", "MEETING"}


def _skills(skills: list[dict[str, Any]] | None) -> list[dict[str, int]]:
    return [{"specializeLevel": int(s.get("specializeLevel") or 0)} for s in skills or []]


def _equip(equip: dict[str, Any] | None) -> dict[str, dict[str, int]]:
    return {mid: {"level": int(st.get("level") or 0), "locked": int(st.get("locked") or 0)} for mid, st in (equip or {}).items()}


def _int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _recruit(user: dict[str, Any]) -> list[dict[str, Any]]:
    """Recruitment slots: tags offered and picked, start and finish times. Nothing else from the recruit data."""
    slots = ((user.get("recruit") or {}).get("normal") or {}).get("slots") or {}
    out = []
    for key in sorted(slots, key=lambda k: _int(k)):
        s = slots[key] or {}
        out.append({
            "slot": _int(key), "state": _int(s.get("state")),
            "tags": [_int(t) for t in s.get("tags") or []],
            "picked": [_int(t.get("tagId")) for t in s.get("selectTags") or [] if isinstance(t, dict) and t.get("pick")],
            "start": _int(s.get("startTs"), -1), "finish": _int(s.get("maxFinishTs"), -1),
        })
    return out


def _building(user: dict[str, Any]) -> dict[str, Any]:
    """The base: rooms, their teams and morale, production and when it completes, and the drones."""
    b = user.get("building") or {}
    bchars, detail = b.get("chars") or {}, b.get("rooms") or {}
    rooms = []
    for slot, r in (b.get("roomSlots") or {}).items():
        kind = (r or {}).get("roomId")
        if kind not in ROOMS:
            continue
        team = []
        for inst in r.get("charInstIds") or []:
            c = bchars.get(str(inst)) if _int(inst, -1) >= 0 else None
            if c and c.get("charId"):
                team.append({"charId": c["charId"], "morale": round(_int(c.get("ap")) / MORALE_UNIT, 2), "ts": _int(c.get("lastApAddTime"))})
        d = (detail.get(kind) or {}).get(slot) or {}
        room: dict[str, Any] = {"slot": slot, "room": kind, "level": _int(r.get("level")), "team": team}
        if kind == "MANUFACTURE":
            room.update(formula=str(d.get("formulaId") or ""), made=_int(d.get("outputSolutionCnt")), capacity=_int(d.get("capacity")),
                        remain=_int(d.get("remainSolutionCnt")), done=_int(d.get("completeWorkTime"), -1))
        elif kind == "TRADING":
            room.update(strategy=d.get("strategy") or "", orders=len(d.get("stock") or []), limit=_int(d.get("stockLimit")),
                        done=_int(d.get("completeWorkTime"), -1))
        elif kind == "DORMITORY":
            room.update(comfort=_int(d.get("comfort")))
        rooms.append(room)
    labor = (b.get("status") or {}).get("labor") or {}
    # the game sends no "full at" for drones; the count, the cap, when it was counted and the recovery speed give it
    drones = {"value": _int(labor.get("value")), "max": _int(labor.get("maxValue")), "ts": _int(labor.get("lastUpdateTime")),
              "speed": float(labor.get("buffSpeed") or 1)} if labor else None
    return {"rooms": rooms, "drones": drones}


def shape(raw: dict[str, Any], depth: int = 4) -> Any:
    """Keys and value types only (no values), for checking the recruit and base parts against a real account."""
    def walk(v: Any, d: int) -> Any:
        if isinstance(v, dict):
            items = list(v.items())[:3] if d < depth - 1 and all(str(k).isdigit() or str(k).startswith("slot_") for k in v) else list(v.items())
            return {str(k): walk(x, d + 1) for k, x in items} if d < depth else "{...}"
        if isinstance(v, list):
            return [walk(v[0], d + 1)] if v else []
        return type(v).__name__
    user = raw.get("user", raw)
    return {"recruit": walk(user.get("recruit"), 0), "building": walk(user.get("building"), 0)}


def minimize(raw: dict[str, Any], server: str) -> dict[str, Any]:
    """Cut the game's sync data down to what Novena reads."""
    user = raw.get("user", raw)
    chars = {}
    for key, c in ((user.get("troop") or {}).get("chars") or {}).items():
        out: dict[str, Any] = {
            "charId": c.get("charId"), "evolvePhase": int(c.get("evolvePhase") or 0), "level": int(c.get("level") or 1),
            "potentialRank": int(c.get("potentialRank") or 0), "mainSkillLvl": int(c.get("mainSkillLvl") or 1),
            "skills": _skills(c.get("skills")), "equip": _equip(c.get("equip")),
        }
        skin = c.get("skin") or c.get("skinId")
        if isinstance(skin, str) and "@" in skin:  # an outfit (the default art needs no note)
            out["skin"] = skin
        if c.get("tmpl"):  # operators with alternate forms (Amiya) keep skills and modules per form
            out["tmpl"] = {fid: {"skills": _skills(f.get("skills")), "equip": _equip(f.get("equip"))} for fid, f in c["tmpl"].items()}
        chars[key] = out
    inventory = {k: int(v) for k, v in (user.get("inventory") or {}).items() if isinstance(v, (int, float)) and v > 0}
    status = {k: (user.get("status") or {}).get(k) for k in STATUS_KEYS if (user.get("status") or {}).get(k) is not None}
    consumable = {}
    for item, stacks in (user.get("consumable") or {}).items():
        kept = {inst: {"ts": int(st.get("ts") or -1), "count": int(st.get("count") or 0)}
                for inst, st in (stacks or {}).items() if int(st.get("count") or 0) > 0}
        if kept:
            consumable[item] = kept
    return {
        "app": APP, "version": 2, "server": server, "synced": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "user": {"troop": {"chars": chars}, "inventory": inventory, "status": status, "consumable": consumable,
                 "recruit": _recruit(user), "building": _building(user)},
    }


def summary(payload: dict[str, Any]) -> str:
    u = payload["user"]
    rooms = len((u.get("building") or {}).get("rooms") or [])
    return f"{len(u['troop']['chars'])} operators, {len(u['inventory'])} depot items" + (f", {rooms} base rooms" if rooms else "")


def save(payload: dict[str, Any], folder: Path) -> Path:
    """One file per server, replaced on every sync, so there's always exactly one to drag into Novena."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"novena-sync-{payload['server']}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return path
