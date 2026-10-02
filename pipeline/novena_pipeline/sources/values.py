"""This server's check of Yituliu's material values (ported unchanged from ako's sources/values.py).

Yituliu's values come from CN's drop rates. Where CN prices an elite material far below what this server's own
stages can supply it for, CN has a source this server doesn't: Loxic Kohl and Manganese Ore at about 2 sanity on
CN in 2026, against 20-37 for other T3s. Each elite material's cost at its best permanent stage here is compared
with Yituliu's value; within a rarity the ratio is steady, and an item far under it is set to that scale times
its cost here. Products crafted from it take the difference on through their recipes.
"""

from __future__ import annotations

import statistics
from collections import defaultdict

PERMANENT_STAGES = ("MAIN", "SUB", "DAILY")
STAGE_LMD_PER_SANITY = 12
MAIN_DROP = 0.35
OUTLIER = 0.5


def _elite(item_id: str) -> bool:
    return len(item_id) == 5 and item_id[:2] in ("30", "31") and item_id.isdigit()


def server_corrections(values: dict[str, float], stages, recipes: dict, rarity: dict[str, int]) -> dict[str, tuple[float, str]]:
    """Item -> (value for this server, why). `recipes`: item -> {"count", "costs": [[id, n]], "lmd"}."""
    elite = [i for i in values if _elite(i)]
    by_tier: dict[int, list[float]] = defaultdict(list)
    for i in elite:
        by_tier[rarity.get(i, 0)].append(values[i])
    tier_median = {t: statistics.median(v) for t, v in by_tier.items()}

    def typical(i: str) -> float:
        return tier_median.get(rarity.get(i, 0), values.get(i, 0.0)) if _elite(i) else values.get(i, 0.0)

    lmd = values.get("4001", 0.0)
    cost: dict[str, tuple[float, str]] = {}
    for s in (s for s in stages if s.stage_type in PERMANENT_STAGES):
        typical_total = sum(r * typical(j) for j, r in s.drops.items()) + STAGE_LMD_PER_SANITY * s.sanity * lmd
        for i, r in s.drops.items():
            if not _elite(i) or i not in values or r * typical(i) < MAIN_DROP * typical_total:
                continue
            others = sum(q * values.get(j, 0.0) for j, q in s.drops.items() if j != i) + STAGE_LMD_PER_SANITY * s.sanity * lmd
            c = (s.sanity - others) / r
            if c > 0 and (i not in cost or c < cost[i][0]):
                cost[i] = (c, s.code)
    ratios: dict[int, list[float]] = defaultdict(list)
    for i, (c, _) in cost.items():
        ratios[rarity.get(i, 0)].append(values[i] / c)
    scale = {t: statistics.median(v) for t, v in ratios.items() if len(v) >= 3}
    out: dict[str, tuple[float, str]] = {}
    for i, (c, code) in cost.items():
        m = scale.get(rarity.get(i, 0))
        if m and values[i] / c < OUTLIER * m:
            out[i] = (m * c, f"{values[i]:.2f} on CN's drop rates; costs {c:.1f} at {code} here")
    delta = {i: v - values[i] for i, (v, _) in out.items()}
    changed = True
    while changed:
        changed = False
        for product, f in recipes.items():
            d = sum(n * delta.get(i, 0.0) for i, n in f["costs"]) / f["count"]
            if product in values and abs(d - delta.get(product, 0.0)) > 1e-9 and any(i in delta for i, _ in f["costs"]):
                delta[product] = d
                out[product] = (values[product] + d, "crafted from a corrected material")
                changed = True
    return out
