"""Write golden outputs from ako's own Python for the TypeScript ports to match (tests/unit/golden.test.ts).

Run with ako's virtualenv, from this repo's root, after the pipeline has built public/data/v1/en:

    ../arknights-optimizer/.venv/Scripts/python scripts/make_golden.py

It also copies the inputs the tests need (three operator files, recipes, stages, recruitment pool) into
tests/golden/, so the unit tests don't depend on a pipeline run.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AKO = Path(os.environ.get("AKO_REPO", ROOT.parent / "arknights-optimizer"))
sys.path.insert(0, str(AKO / "src"))
os.environ.setdefault("AKO_DATA", str(AKO / "data"))

from ako import costs, crafting, farming, recruit  # noqa: E402
from ako.sources.penguin import Stage  # noqa: E402

DATA = ROOT / "public" / "data" / "v1" / "en"
OUT = ROOT / "tests" / "golden"
OPS = ["char_202_demkni", "char_151_myrtle", "char_120_hibisc", "char_1028_texas2"]


def dump(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8", newline="\n")


def main() -> None:
    inputs = {cid: json.loads((DATA / "ops" / f"{cid}.json").read_text(encoding="utf-8")) for cid in OPS}
    dump("ops.json", inputs)
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    dump("const.json", meta["const"])

    cost_cases = {}
    for cid, d in inputs.items():
        caps = [p["max"] for p in d["phases"]]
        top = len(caps) - 1
        case = {
            "growth": dict(costs.growth_cost(cid, 0, 1, top, caps[top], "en")),
            "growth_mid": dict(costs.growth_cost(cid, 0, 15, min(1, top), caps[min(1, top)] - 5, "en")),
            "skill_levels": dict(costs.skill_level_cost(cid, 1, 7, "en")),
            "masteries": [dict(costs.mastery_cost(cid, s["id"], 0, 3, "en")) for s in d["skills"]],
            "modules": {m["letter"]: dict(costs.module_cost(m["id"], 0, 3, "en")) for m in d["modules"]},
        }
        cost_cases[cid] = case
    dump("costs.json", cost_cases)

    items = json.loads((DATA / "items.json").read_text(encoding="utf-8"))
    dump("recipes.json", items["recipes"])
    recipes = crafting.formulas("en")
    inventories = [
        {"30012": 40, "30011": 30, "30062": 10, "30032": 20, "4001": 500000, "3003": 30, "2004": 20},
        {"30073": 2, "30083": 5, "30093": 8, "31023": 6, "4001": 2_000_000, "30013": 12, "30043": 9, "30053": 7},
        {"3231": 2, "3232": 3, "3211": 2, "4001": 100000},
    ]
    demands = [
        {"30013": 6, "30063": 3, "4001": 100000, "EXP": 30000},
        {"30084": 4, "30094": 2, "31024": 3, "30044": 2, "4001": 1_000_000},
        {"3233": 2, "3231": 1, "4001": 50000},
    ]
    craft_cases = []
    for inv, demand in zip(inventories, demands):
        stock = crafting.Stock(inv, recipes)
        short = stock.pay(Counter(demand))
        craft_cases.append({"inventory": inv, "cost": demand, "short": dict(short),
                            "after": {k: v for k, v in stock.items.items() if v}})
    dump("crafting.json", craft_cases)

    stages_file = json.loads((DATA / "stages.json").read_text(encoding="utf-8"))
    dump("stages.json", stages_file["stages"])
    stages = [Stage(s["id"], s["code"], s["ap"], s["type"], s["drops"]) for s in stages_file["stages"]]
    farm_cases = []
    for need, inv in [({"30073": 10, "30083": 6, "31024": 4}, {}),
                      ({"30104": 5, "30014": 8, "30063": 20}, {"30013": 10}),
                      ({"3233": 4, "30135": 2, "4001": 300000, "EXP": 100000}, {"4001": 100000})]:
        p = farming.plan(Counter(need), inv, stages, recipes)
        farm_cases.append({"need": need, "inventory": inv, "sanity": p.sanity, "unmet": dict(p.unmet),
                           "lmd_short": p.lmd_short, "exp_short": p.exp_short,
                           "runs": {s.code: r for s, r in p.runs}})
    dump("farming.json", farm_cases)

    rec = json.loads((DATA / "recruit.json").read_text(encoding="utf-8"))
    dump("recruit_pool.json", rec)
    name_of = {t["id"]: t["name"] for t in rec["tags"]}
    id_of = {v: k for k, v in name_of.items()}
    sets = [["Top Operator", "Defender", "Healing", "Ranged", "Slow"],
            ["Senior Operator", "Supporter", "Crowd-Control", "DPS", "Melee"],
            ["Robot", "Starter", "Vanguard", "DP-Recovery", "Guard"],
            ["Shift", "Crowd-Control", "Defense", "Specialist", "Nuker"],
            ["Debuff", "Fast-Redeploy", "Summon", "AoE", "Survival"]]
    rec_cases = []
    for tags in sets:
        found = recruit.combos(tags, "en")
        worth = recruit.worth_picking(found)
        # gender isn't in ako's pool, so the golden runs without Male/Female tags (none of these sets use them)
        rec_cases.append({"tags": [id_of[t] for t in tags],
                          "combos": [{"tags": sorted(id_of[t] for t in c.tags), "rarity": c.rarity,
                                      "candidates": sorted(r.char_id for r in c.candidates)} for c in found],
                          "worth": [sorted(id_of[t] for t in c.tags) for c in worth]})
    dump("recruit.json", rec_cases)
    print("golden files written to", OUT)


if __name__ == "__main__" and "--planner" not in sys.argv:
    main()


def planner_case() -> None:
    """ako's make_plan on a made-up mid-game roster and a slice of the guides, plus the same inputs in the site's
    formats, for tests/unit/planner.test.ts."""
    from ako import efficiency, gamedata, planner
    from ako.roster import Module, Operator, Skill, Snapshot
    from ako.sources import copilot as ako_copilot, values as ako_values, yituliu as ako_yituliu

    jobs = ako_copilot.load()
    investment, _ = ako_yituliu.load()
    results = efficiency.build(jobs, investment)
    book = planner.Guidebook(jobs, results, "en")
    book.guides = [g for g in book.guides if g.stage.startswith(("main_0", "main_1"))][:2500]
    values = ako_values.load()

    chars = gamedata.table("character_table", "en")
    uniequip = gamedata.table("uniequip_table", "en")
    picks = ["char_202_demkni", "char_151_myrtle", "char_120_hibisc", "char_128_plosis", "char_103_angel", "char_148_nearl",
             "char_010_chen", "char_017_huang", "char_180_amgoat", "char_263_skadi", "char_112_siege", "char_136_hsguma",
             "char_118_yuki", "char_183_skgoat", "char_101_sora", "char_102_texas", "char_109_fmout", "char_107_liskam",
             "char_134_ifrit", "char_197_poca", "char_215_mantic", "char_158_milu", "char_155_tiger", "char_145_prove"]
    ops = {}
    roster_out = {}
    for i, cid in enumerate(picks):
        e = chars[cid]
        rarity = int(e["rarity"].removeprefix("TIER_"))
        elite = min(len(e["phases"]) - 1, 2 if i % 3 == 0 else 1)
        level = e["phases"][elite]["maxLevel"] - (10 if i % 2 else 0)
        sl = 7 if elite >= 1 and rarity >= 3 else 4 if rarity >= 3 else 1
        masteries = [(1 if (elite == 2 and j == 0 and i % 4 == 0) else 0) for j, _ in enumerate(e["skills"])]
        mods = [m for m in uniequip["charEquip"].get(cid, []) if uniequip["equipDict"][m].get("type") != "INITIAL"]
        ops[cid] = Operator(cid, elite, level, 1, sl, 0, [Skill(s["skillId"], m) for s, m in zip(e["skills"], masteries)],
                            [Module(m, 0) for m in mods])
        roster_out[cid] = {"elite": elite, "level": level, "skillLevel": sl, "masteries": masteries, "modules": {}}
    snap = Snapshot("en", "0", "golden#0", 100, 0, ops, {})
    plan = planner.make_plan(snap, jobs, results, values, book=book, top=8)

    kind = {"elite": 0, "level": 1, "mastery": 2, "module": 3}
    char_list, char_idx, req_list, req_idx, stage_list, stage_idx, guide_rows = [], {}, [], {}, [], {}, []
    for g in book.guides:
        slots = []
        for slot in g.slots:
            opts = []
            for cid, r in slot:
                if cid not in char_idx:
                    char_idx[cid] = len(char_list)
                    char_list.append(cid)
                if r not in req_idx:
                    req_idx[r] = len(req_list)
                    req_list.append([r.elite, r.level, r.skill, r.skill_level, r.module or "", r.module_stage,
                                     [[kind[s.kind], s.value, s.miss] for s in r.soft]])
                opts.append([char_idx[cid], req_idx[r]])
            slots.append(opts)
        if g.stage not in stage_idx:
            stage_idx[g.stage] = len(stage_list)
            stage_list.append([g.stage, book.stages.category(g.stage)])
        guide_rows.append([stage_idx[g.stage], g.weight, slots, g.job_id])
    costs_all = json.loads((DATA / "costs.json").read_text(encoding="utf-8"))
    dump("planner.json", {
        "book": {"chars": char_list, "stages": stage_list, "reqs": req_list, "guides": guide_rows},
        "costs": {cid: costs_all[cid] for cid in picks}, "values": values, "roster": roster_out,
        "available": sorted(book.available), "weights": efficiency.DEFAULT_WEIGHTS,
        "expected": {"start": plan.start_value, "end": plan.end_value,
                     "steps": [{"id": s.char_id, "after": {"elite": s.after.elite, "level": s.after.level, "skillLevel": s.after.skill_level,
                                                           "masteries": s.after.masteries, "modules": s.after.modules},
                                "sanity": s.sanity, "gain": s.gain} for s in plan.steps]},
    })


if __name__ == "__main__" and "--planner" in sys.argv:
    planner_case()
