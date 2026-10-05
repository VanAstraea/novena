"""What leaves the game data: only what Novena uses.

The game's sync data holds far more than a roster (your nickname, friends, mail, purchase history, every stage
cleared). Before anything is saved or sent, it's cut down to operators, the depot and the currencies the pull planner
counts. The result is still shaped like sync data, so Novena reads it with the importer it already has.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP = "novena-sync"
STATUS_KEYS = ("gold", "diamondShard", "freeDiamond", "payDiamond", "gachaTicket", "tenGachaTicket", "monthlySubscriptionEndTime")


def _skills(skills: list[dict[str, Any]] | None) -> list[dict[str, int]]:
    return [{"specializeLevel": int(s.get("specializeLevel") or 0)} for s in skills or []]


def _equip(equip: dict[str, Any] | None) -> dict[str, dict[str, int]]:
    return {mid: {"level": int(st.get("level") or 0), "locked": int(st.get("locked") or 0)} for mid, st in (equip or {}).items()}


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
        if c.get("tmpl"):  # operators with alternate forms (Amiya) keep skills and modules per form
            out["tmpl"] = {fid: {"skills": _skills(f.get("skills")), "equip": _equip(f.get("equip"))} for fid, f in c["tmpl"].items()}
        chars[key] = out
    inventory = {k: int(v) for k, v in (user.get("inventory") or {}).items() if isinstance(v, (int, float)) and v > 0}
    status = {k: (user.get("status") or {}).get(k) for k in STATUS_KEYS if (user.get("status") or {}).get(k) is not None}
    return {
        "app": APP, "version": 1, "server": server, "synced": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "user": {"troop": {"chars": chars}, "inventory": inventory, "status": status},
    }


def summary(payload: dict[str, Any]) -> str:
    u = payload["user"]
    return f"{len(u['troop']['chars'])} operators, {len(u['inventory'])} depot items"


def save(payload: dict[str, Any], folder: Path) -> Path:
    """One file per server, replaced on every sync, so there's always exactly one to drag into Novena."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"novena-sync-{payload['server']}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return path
