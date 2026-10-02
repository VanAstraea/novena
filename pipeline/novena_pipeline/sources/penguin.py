"""Penguin Statistics drop rates for each region (ported from ako). Data license: CC BY-NC 4.0.

Only stages that exist on the server and aren't closed are kept: main story, supply and chip stages, permanent
event reruns (`<id>_perm`). Rates are the current matrix rows with enough samples to trust.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from novena_pipeline import CACHE_DIR
from novena_pipeline.net import cached_json

API = "https://penguin-stats.io/PenguinStats/api/v2"
REGION = {"en": "US", "jp": "JP", "kr": "KR", "cn": "CN"}
MIN_SAMPLES = 100
MAX_AGE = 20 * 3600
_STAGE_CODE = re.compile(r"^[\x20-\x7e]+$")  # real stages have ASCII codes; reward packages don't


@dataclass
class Stage:
    stage_id: str
    code: str
    sanity: int
    stage_type: str
    zone: str = ""
    drops: dict[str, float] = field(default_factory=dict)


def load(server: str) -> tuple[list[Stage], float]:
    region = REGION[server]
    raw_stages = cached_json(CACHE_DIR / "sources" / f"penguin_stages_{region}.json", f"{API}/stages?server={region}", MAX_AGE)
    matrix_path = CACHE_DIR / "sources" / f"penguin_matrix_{region}.json"
    raw_matrix = cached_json(matrix_path, f"{API}/result/matrix?server={region}", MAX_AGE)
    now = time.time() * 1000
    stages: dict[str, Stage] = {}
    for s in raw_stages:
        ex = (s.get("existence") or {}).get(region) or {}
        if not ex.get("exist") or (ex.get("closeTime") and ex["closeTime"] < now):
            continue
        if s.get("apCost", 0) <= 0 or not _STAGE_CODE.match(s.get("code") or ""):
            continue
        stages[s["stageId"]] = Stage(s["stageId"], s["code"], s["apCost"], s.get("stageType", ""), s.get("zoneId", ""))
    for r in raw_matrix["matrix"]:
        st = stages.get(r["stageId"])
        if st and r.get("end") is None and r["times"] >= MIN_SAMPLES and r["quantity"] > 0:
            st.drops[r["itemId"]] = r["quantity"] / r["times"]
    return [s for s in stages.values() if s.drops], matrix_path.stat().st_mtime
