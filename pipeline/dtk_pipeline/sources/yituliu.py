"""Yituliu (ark.yituliu.cn): operator investment statistics from ~100k CN accounts, and material values in sanity.

Investment: of the players who own an operator, how many took it to E2, mastered each skill, raised each module.
Values: sanity-equivalents from CN drop rates (their static item_info.json; the /item/value API is gone).
"""

from __future__ import annotations

from typing import Any

from dtk_pipeline import CACHE_DIR
from dtk_pipeline.net import cached_json

OPERATORS = "https://backend.yituliu.cn/survey/operator/result/v2"
VALUES = "https://raw.githubusercontent.com/Arknights-yituliu/frontend-v2-plus/HEAD/src/static/json/material/item_info.json"
MAX_AGE = 20 * 3600
EXP_CARD, EXP_PER_CARD = "2004", 2000


def _count(dist: dict[str, int] | None, at_least: int) -> int:
    return sum(n for k, n in (dist or {}).items() if int(k) >= at_least)


def investment() -> tuple[dict[str, dict[str, Any]], int]:
    """char id -> {own, e2, m3: {1,2,3}, mod: {X..}, mod3: {X..}}, and the survey's createTime (ms)."""
    payload = cached_json(CACHE_DIR / "sources" / "yituliu_operators.json", OPERATORS, MAX_AGE)
    data = payload.get("data", payload)  # ako cached the inner "data"
    out = {}
    for row in data["result"]:
        own = row.get("own") or 0
        e2 = (row.get("elite") or {}).get("2", 0)

        def per_e2(n: int) -> float:
            return round(n / e2, 4) if e2 else 0.0

        out[row["charId"]] = {
            "own": round(own / row["sampleSize"], 4) if row.get("sampleSize") else 0.0,
            "e2": round(e2 / own, 4) if own else 0.0,
            "m3": {str(k): per_e2(_count(row.get(f"skill{k}"), 3)) for k in (1, 2, 3) if row.get(f"skill{k}")},
            "mod": {t: per_e2(_count(row.get(f"mod{t}"), 1)) for t in "XYAD" if f"mod{t}" in row},
            "mod3": {t: per_e2(_count(row.get(f"mod{t}"), 3)) for t in "XYAD" if f"mod{t}" in row},
        }
    return out, int(data.get("createTime") or 0)


def values() -> dict[str, float]:
    rows = cached_json(CACHE_DIR / "sources" / "item_values.json", VALUES, MAX_AGE)
    out = {row["itemId"]: float(row["itemValueAp"]) for row in rows}
    if EXP_CARD in out:
        out["EXP"] = out[EXP_CARD] / EXP_PER_CARD
    return out
