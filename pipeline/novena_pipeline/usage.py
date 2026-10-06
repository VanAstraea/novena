"""Community usage per operator and archetype (ported from ako's efficiency.py and gaps.archetype_demand).

* Usage (MAA Copilot guides): for each stage, the view-weighted share of its guides that include the operator,
  averaged per content type with every stage counting equally (a stage with fewer than MIN_GUIDES guides counts
  proportionally less), so one popular event can't dominate.
* Investment (Yituliu): of ~100k CN owners, how many took it to E2, mastered each skill, raised each module.
* Community build: the promotion, skill, mastery and module at least half of clears or owners use.
* Lift: usage / ownership. Guide authors favour widely owned operators, so lift shows who is picked out of
  proportion to how many players have them.

Both sources are CN, which runs ahead of the other servers: rankings hold, absolute percentages read low.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from novena_pipeline import gamedata as gd
from novena_pipeline.sources import copilot

# "paradox": Paradox Simulation (an operator's mem_ stages). "other": what's left, mostly Stationary Security Service
# maps. Integrated Strategies and Reclamation Algorithm have no stage guides, so they aren't in this data at all.
CATEGORIES = ("main", "event", "annihilation", "cc", "supply", "paradox", "other")
DEFAULT_WEIGHTS = {"main": 0.25, "event": 0.35, "annihilation": 0.10, "cc": 0.20, "supply": 0.05, "paradox": 0.03, "other": 0.02}
MIN_GUIDES = 3
DEMAND = 0.5
_STAGE_TYPE = {"MAIN": "main", "SUB": "main", "ACTIVITY": "event", "CAMPAIGN": "annihilation", "DAILY": "supply"}
_CC = re.compile(r"(^level_crisis|rune/level_rune|^level_rune|^level_act\d+rune)")


class StageIndex:
    """Normalises the stage identifiers guides use (ids, codes, names) and classifies them."""

    def __init__(self) -> None:
        self.stages = gd.table("stage_table", "cn")["stages"]
        codes, names = defaultdict(list), defaultdict(list)
        for sid, stage in self.stages.items():
            codes[stage["code"]].append(sid)
            names[stage["name"]].append(sid)
        self._alias = {k: v[0] for d in (codes, names) for k, v in d.items() if len(v) == 1}
        # A code several stages share ("3-1" is the normal and the Tough version, an event's EX stages come back in
        # its rerun): no single stage, but usually a single kind of content.
        self._shared = {k: v for d in (codes, names) for k, v in d.items() if len(v) > 1}

    def resolve(self, stage: str) -> str:
        return stage if stage in self.stages else self._alias.get(stage, stage)

    def _kind(self, stage_id: str) -> str:
        if _CC.search(stage_id):
            return "cc"
        if stage_id.startswith("mem_"):
            return "paradox"
        stage = self.stages.get(stage_id)
        return _STAGE_TYPE.get(stage["stageType"], "other") if stage else "other"

    def category(self, stage_id: str) -> str:
        if stage_id not in self.stages and stage_id in self._shared:
            kinds = {self._kind(s) for s in self._shared[stage_id]}
            if len(kinds) == 1:
                return kinds.pop()
        return self._kind(stage_id)


def ids_by_cn_name() -> dict[str, str]:
    return {e["name"]: cid for cid, e in gd.table("character_table", "cn").items() if gd.is_playable(cid, e)}


@dataclass
class Usage:
    by_category: dict[str, float] = field(default_factory=dict)
    weight: float = 0.0
    skill_share: dict[int, float] = field(default_factory=dict)
    m3_share: dict[int, float] = field(default_factory=dict)
    e2_share: float = 0.0
    module_share: dict[str, float] = field(default_factory=dict)
    module_named: float = 0.0

    def score(self, weights: dict[str, float] = DEFAULT_WEIGHTS) -> float:
        total = sum(weights.values())
        return sum(w * self.by_category.get(c, 0.0) for c, w in weights.items()) / total if total else 0.0

    @property
    def main_skill(self) -> int | None:
        return max(self.skill_share, key=self.skill_share.get) if self.skill_share else None

    @property
    def main_module(self) -> str | None:
        return max(self.module_share, key=self.module_share.get) if self.module_share else None


@dataclass
class _Tally:
    skills: Counter = field(default_factory=Counter)
    skill_sl: Counter = field(default_factory=Counter)
    skill_m3: Counter = field(default_factory=Counter)
    elite_named: float = 0.0
    e2: float = 0.0
    modules: Counter = field(default_factory=Counter)
    module_named: float = 0.0
    total: float = 0.0


def job_weight(job: copilot.Job) -> float:
    return 1.0 + math.log1p(job.views)


def compute_usage(jobs: list[copilot.Job], stages: StageIndex, names: dict[str, str]) -> tuple[dict[str, Usage], dict]:
    """Usage per key (`names` maps a guide's CN name to the key: a char id, or an archetype), and per-category
    totals {category: {"stages": n, "guides": n}}."""
    stage_weight: Counter = Counter()
    stage_jobs: Counter = Counter()
    stage_use: dict[str, Counter] = defaultdict(Counter)
    tallies: dict[str, _Tally] = defaultdict(_Tally)
    for job in jobs:
        stage = stages.resolve(job.stage)
        w = job_weight(job)
        stage_weight[stage] += w
        stage_jobs[stage] += 1
        presence: Counter = Counter()
        for slot in job.slots:
            for use in slot:
                key = names.get(use.name)
                if not key:
                    continue
                share = 1.0 / len(slot)
                presence[key] += share
                t = tallies[key]
                pw = w * share
                t.total += pw
                if use.skill:
                    t.skills[use.skill] += pw
                    if use.skill_level:
                        t.skill_sl[use.skill] += pw
                        t.skill_m3[use.skill] += pw * (use.skill_level >= 10)
                if use.elite:
                    t.elite_named += pw
                    t.e2 += pw * (use.elite >= 2)
                if use.module >= 0:
                    t.module_named += pw
                    if letter := copilot.MODULE_LETTER.get(use.module):
                        t.modules[letter] += pw
        for key, p in presence.items():
            stage_use[stage][key] += w * min(p, 1.0)

    category_mass: Counter = Counter()
    category_use: dict[str, Counter] = defaultdict(Counter)
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"stages": 0, "guides": 0})
    for stage, total in stage_weight.items():
        cat = stages.category(stage)
        damp = min(1.0, stage_jobs[stage] / MIN_GUIDES)
        category_mass[cat] += damp
        totals[cat]["stages"] += 1
        totals[cat]["guides"] += stage_jobs[stage]
        for key, used in stage_use[stage].items():
            category_use[key][cat] += damp * used / total

    usage = {}
    for key, t in tallies.items():
        skill_total = sum(t.skills.values())
        module_total = sum(t.modules.values())
        usage[key] = Usage(
            by_category={c: category_use[key][c] / category_mass[c] for c in category_mass},
            weight=t.total,
            skill_share={k: v / skill_total for k, v in t.skills.items()} if skill_total else {},
            m3_share={k: t.skill_m3[k] / t.skill_sl[k] for k in t.skill_sl if t.skill_sl[k]},
            e2_share=t.e2 / t.elite_named if t.elite_named else 0.0,
            module_share={k: v / module_total for k, v in t.modules.items()} if module_total else {},
            module_named=t.module_named / t.total if t.total else 0.0,
        )
    return usage, dict(totals)


def build_target(u: Usage | None, inv: dict | None, rarity: int) -> dict[str, object]:
    """The build the community converges on (ako's efficiency.build_target)."""
    inv = inv or {}
    target: dict[str, object] = {}
    if rarity >= 4 and max(u.e2_share if u else 0, inv.get("e2", 0)) >= DEMAND:
        target["elite"] = 2
    skill = u.main_skill if u else None
    if skill:
        target["skill"] = skill
        if rarity >= 4 and max(u.m3_share.get(skill, 0), (inv.get("m3") or {}).get(str(skill), 0)) >= DEMAND:
            target["mastery"] = 3
    module_rates = dict(inv.get("mod") or {})
    if u and u.main_module:
        module_rates.setdefault(u.main_module, u.module_share[u.main_module])
    if module_rates:
        letter = max(module_rates, key=module_rates.get)
        if module_rates[letter] >= DEMAND:
            target["module"] = letter
    return target


def _r(x: float) -> float:
    return round(x, 5)


def build(jobs: list[copilot.Job], investment: dict[str, dict]) -> dict:
    stages = StageIndex()
    names = ids_by_cn_name()
    usage, totals = compute_usage(jobs, stages, names)
    cn_chars = gd.table("character_table", "cn")
    ops = {}
    for cid in sorted(usage.keys() | investment.keys()):
        e = cn_chars.get(cid)
        if not e or not gd.is_playable(cid, e):
            continue
        u, inv = usage.get(cid), investment.get(cid)
        row: dict = {}
        if u:
            score = u.score()
            row.update({
                "u": {c: _r(v) for c, v in u.by_category.items() if v > 0},
                "score": _r(score),
                "skill": {str(k): _r(v) for k, v in u.skill_share.items()},
                "m3": {str(k): _r(v) for k, v in u.m3_share.items()},
                "e2": _r(u.e2_share),
                "mod": {k: _r(v) for k, v in u.module_share.items()},
                "w": round(u.weight, 1),
            })
        if inv:
            row["inv"] = inv
            if u and inv.get("own"):
                row["lift"] = _r(u.score() / inv["own"])
        row["build"] = build_target(u, inv, gd.rarity(e))
        ops[cid] = row
    by_arch = {e["name"]: e["subProfessionId"] for cid, e in cn_chars.items() if gd.is_playable(cid, e)}
    arch_usage, _ = compute_usage(jobs, stages, by_arch)
    archetypes = {a: {"u": {c: _r(v) for c, v in u.by_category.items() if v > 0}, "score": _r(u.score())}
                  for a, u in arch_usage.items()}
    return {"weights": DEFAULT_WEIGHTS, "totals": totals, "guides": len(jobs), "ops": ops, "archetypes": archetypes}


def stage_presence(jobs: list[copilot.Job], stage_ids: set[str], stages: StageIndex, names: dict[str, str],
                   top: int = 10) -> tuple[list[dict], int, int]:
    """The operators most present in the guides for these stages (view-weighted share of guides), how many guides,
    and how many of the stages have one (ako's upcoming.key_operators)."""
    presence: Counter = Counter()
    total = 0.0
    count = 0
    guided: set[str] = set()
    for job in jobs:
        sid = stages.resolve(job.stage)
        if sid not in stage_ids:
            continue
        w = job_weight(job)
        total += w
        count += 1
        guided.add(sid)
        seen = {names[o.name] for slot in job.slots for o in slot if o.name in names}
        for cid in seen:
            presence[cid] += w
    return ([{"id": cid, "share": round(w / total, 4)} for cid, w in presence.most_common(top)] if total else [],
            count, len(guided))
