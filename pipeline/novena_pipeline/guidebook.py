"""The planner's guidebook (ako's planner.Requirements + build_guides), published compactly for the browser.

Each guide becomes its stage, a weight (1 + log1p(views)) and its slots; each slot lists the operators that can
fill it with the requirement each one carries. A requirement is hard (what the guide states, plus game rules: a
skill's unlock promotion, E2 for masteries and modules) plus soft parts for what the guide leaves unstated (E2,
the level most guides state, M3 on the skill used, the main module), each with the chance the guide still works
without it: 1 - how common the community has it. Only 29% of guides state any requirement, so this is what lets
a plan say "E2 now, M3 later".

Nothing identifying is published: no titles, text, authors or guide ids.

The guides are columns, under half the size of one row per guide (the slots are most of it, so they share a
table of operator uses, the most common first, and are listed stage by stage, where nearby guides look alike):

    {"chars": [char id], "stages": [[stage id, category]], "reqs": [[elite, level, skill, skill_level, module,
     module_stage, [[kind, value, miss]]]], "uses": [char index, req index, ...],
     "stage": [stage index per guide], "weight": [round(weight * 1000) per guide],
     "slots": [[use index, or [use index, ...] for a slot several operators can fill] per guide, by stage]}

Guides keep the order they were posted in (the planner's ties depend on it): the nth guide of stage s in "stage" is
the nth of stage s's run in "slots".

kind: 0 elite, 1 level, 2 mastery, 3 module.
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict

from novena_pipeline import gamedata as gd
from novena_pipeline.sources import copilot
from novena_pipeline.usage import StageIndex, ids_by_cn_name, job_weight

MIN_LEVEL_SAMPLES = 5
CERTAIN = 1 - 1e-9
KIND = {"elite": 0, "level": 1, "mastery": 2, "module": 3}


def _demand(row: dict | None) -> dict:
    """How often the community has each part of the build: max(share of clears stating it, share of owners)."""
    if not row:
        return {}
    inv = row.get("inv") or {}
    out: dict = {"elite": min(max(row.get("e2", 0), inv.get("e2", 0)), CERTAIN)}
    skills = {int(k) for k in (row.get("skill") or {})} | {int(k) for k in (inv.get("m3") or {})}
    out["mastery"] = {k: max((row.get("m3") or {}).get(str(k), 0), (inv.get("m3") or {}).get(str(k), 0)) for k in skills}
    rates = dict(inv.get("mod") or {})
    mods = row.get("mod") or {}
    if mods:
        main = max(mods, key=mods.get)
        rates[main] = max(rates.get(main, 0), mods[main])
    if rates:
        letter = max(rates, key=rates.get)
        if rates[letter] > 0:
            out["module"] = (letter, min(rates[letter], CERTAIN))
    return out


def build(jobs: list[copilot.Job], usage_ops: dict) -> dict:
    names = ids_by_cn_name()
    cn = gd.table("character_table", "cn")
    stages = StageIndex()
    uses: dict[str, list[copilot.OperUse]] = defaultdict(list)
    for job in jobs:
        for slot in job.slots:
            for u in slot:
                if u.name in names:
                    uses[names[u.name]].append(u)
    skill_phase, max_elite, e2_level, demand = {}, {}, {}, {}
    for cid, us in uses.items():
        e = cn.get(cid)
        if not e:
            continue
        skill_phase[cid] = [gd.phase(s["unlockCond"]["phase"]) for s in e.get("skills") or []]
        max_elite[cid] = len(e["phases"]) - 1
        levels = [u.level for u in us if u.elite == 2 and u.level > 0]
        e2_level[cid] = int(statistics.median(levels)) if len(levels) >= MIN_LEVEL_SAMPLES else 1
        demand[cid] = _demand(usage_ops.get(cid))

    reqs: list[list] = []
    req_index: dict[tuple, int] = {}

    def req_of(cid: str, u: copilot.OperUse) -> int:
        skill, elite, level, sl = u.skill, u.elite, u.level, u.skill_level
        module = copilot.MODULE_LETTER.get(u.module)
        phases = skill_phase.get(cid, [])
        if skill and skill <= len(phases):
            elite = max(elite, phases[skill - 1])
        if sl >= 8 or module:
            elite = 2
        soft = []
        d = demand.get(cid, {})
        if max_elite.get(cid, 0) >= 2:
            if not u.elite and elite < 2 and d.get("elite", 0) > 0:
                soft.append([KIND["elite"], 2, round(1 - d["elite"], 4)])
            if not u.level and e2_level.get(cid, 1) > 1:
                soft.append([KIND["level"], e2_level[cid], 0.5])
            m3 = d.get("mastery", {}).get(skill, 0)
            if skill and not sl and m3 > 0:
                soft.append([KIND["mastery"], 3, round(1 - m3, 4)])
            if u.module < 0 and d.get("module"):
                letter, rate = d["module"]
                soft.append([KIND["module"], letter, round(1 - rate, 4)])
        row = [elite, max(level, 1 if elite else 0), skill, sl, module or "", u.module_level, soft]
        key = (row[0], row[1], row[2], row[3], row[4], row[5], tuple(tuple(x) for x in soft))
        if key not in req_index:
            req_index[key] = len(reqs)
            reqs.append(row)
        return req_index[key]

    chars: list[str] = []
    char_index: dict[str, int] = {}
    stage_rows: list[list] = []
    stage_index: dict[str, int] = {}
    guides = []
    for job in jobs:
        slots = []
        for slot in job.slots:
            options = []
            for u in slot:
                cid = names.get(u.name)
                if not cid:
                    continue
                if cid not in char_index:
                    char_index[cid] = len(chars)
                    chars.append(cid)
                options.append([char_index[cid], req_of(cid, u)])
            if options:
                slots.append(options)
        if not slots:
            continue
        sid = stages.resolve(job.stage)
        if sid not in stage_index:
            stage_index[sid] = len(stage_rows)
            stage_rows.append([sid, stages.category(sid)])
        guides.append([stage_index[sid], job_weight(job), slots])
    return {"chars": chars, "stages": stage_rows, "reqs": reqs, **pack(guides)}


def pack(guides: list[list]) -> dict:
    """[stage index, weight, [[[char index, req index], ...], ...]] per guide as the published columns."""
    count: Counter = Counter(tuple(o) for _, _, slots in guides for slot in slots for o in slot)
    use = {o: i for i, (o, _) in enumerate(count.most_common())}
    by_stage: dict[int, list] = defaultdict(list)
    for si, _, slots in guides:
        by_stage[si].append([use[tuple(slot[0])] if len(slot) == 1 else [use[tuple(o)] for o in slot] for slot in slots])
    return {"uses": [x for o in use for x in o], "stage": [g[0] for g in guides],
            "weight": [round(g[1] * 1000) for g in guides], "slots": [s for si in sorted(by_stage) for s in by_stage[si]]}
