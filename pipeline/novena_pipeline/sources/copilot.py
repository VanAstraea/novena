"""MAA Copilot (prts.plus) clear guides, fetched incrementally (ported from ako's sources/copilot.py).

Read-only, used for aggregate usage statistics. Individual guides are never republished: the site gets per-operator
and per-stage aggregates, and a guidebook of char ids and requirement numbers for the planner (no titles, text or
authors). The fetch walks newest first and stops at the newest guide already cached, pausing between pages.
"""

from __future__ import annotations

import gzip
import json
import time
from dataclasses import dataclass
from typing import Any

from novena_pipeline import CACHE_DIR
from novena_pipeline.net import get_json_within

API = "https://prts.maa.plus/copilot/query?page={page}&limit={limit}&order_by=id"
CACHE = CACHE_DIR / "sources" / "copilot_jobs.json.gz"
CACHE_VERSION = 2  # same compact format as ako's cache
PAGE_SIZE = 1000
MODULE_LETTER = {1: "X", 2: "Y", 3: "A", 4: "D"}  # requirements.module, per MaaCore AsstBattleDef.h


@dataclass
class OperUse:
    name: str  # CN operator name, as MAA uses
    skill: int  # 1-3, 0 if unspecified
    elite: int  # required elite, 0 if unspecified
    skill_level: int  # 1-7, 8-10 = M1-M3, 0 if unspecified
    module: int  # -1 unspecified, 0 none, 1-4 = X/Y/A/D
    level: int = 0
    module_level: int = 0


@dataclass
class Job:
    id: int
    stage: str
    views: int
    slots: list[list[OperUse]]


def _oper(raw: dict[str, Any]) -> dict[str, Any]:
    req = raw.get("requirements") or {}
    return {"name": raw["name"], "skill": int(raw.get("skill") or 0), "elite": int(req.get("elite") or 0),
            "sl": int(req.get("skill_level") or 0), "module": int(req.get("module", -1)),
            "lv": int(req.get("level") or 0), "ml": int(req.get("module_level") or 0)}


def _compact(raw_job: dict[str, Any]) -> dict[str, Any] | None:
    try:
        content = json.loads(raw_job["content"])
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    slots = [[_oper(o)] for o in content.get("opers") or [] if o.get("name")]
    for group in content.get("groups") or []:
        options = [_oper(o) for o in group.get("opers") or [] if o.get("name")]
        if options:
            slots.append(options)
    if not slots or not content.get("stage_name"):
        return None
    return {"id": raw_job["id"], "stage": content["stage_name"], "views": int(raw_job.get("views") or 0), "slots": slots}


def _load_cache() -> list[dict[str, Any]]:
    if not CACHE.exists():
        return []
    with gzip.open(CACHE, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or data.get("version") != CACHE_VERSION:
        return []
    return data["jobs"]


def refresh(max_pages: int = 200, log=print, budget: float = 900) -> tuple[int, int]:
    """Fetch guides newer than the cache, within `budget` seconds. Returns (new, total)."""
    cached = _load_cache()
    known = max((j["id"] for j in cached), default=0)
    fresh: list[dict[str, Any]] = []
    start = time.time()
    for page in range(1, max_pages + 1):
        left = budget - (time.time() - start)
        if left <= 0:
            raise TimeoutError(f"MAA Copilot took longer than {budget:.0f} s")
        data = get_json_within(API.format(page=page, limit=PAGE_SIZE), min(left, 400))["data"]
        batch = data["data"]
        fresh += [c for j in batch if j["id"] > known and j.get("available", True) and (c := _compact(j))]
        log(f"  copilot page {page}: {len(fresh)} new guides")
        if not data.get("has_next") or not batch or batch[-1]["id"] <= known:
            break
        time.sleep(1.0)  # be polite to a community-run service
    by_id = {j["id"]: j for j in cached}
    by_id.update({j["id"]: j for j in fresh})
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(CACHE, "wt", encoding="utf-8") as f:
        json.dump({"version": CACHE_VERSION, "jobs": sorted(by_id.values(), key=lambda j: j["id"])},
                  f, ensure_ascii=False, separators=(",", ":"))
    return len(fresh), len(by_id)


def load() -> list[Job]:
    return [
        Job(j["id"], j["stage"], j["views"],
            [[OperUse(o["name"], o["skill"], o["elite"], o["sl"], o["module"], o["lv"], o["ml"]) for o in slot]
             for slot in j["slots"]])
        for j in _load_cache()
    ]


def fetched_at() -> float:
    return CACHE.stat().st_mtime if CACHE.exists() else 0.0
