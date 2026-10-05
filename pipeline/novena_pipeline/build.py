"""Build every published data file.

    python -m novena_pipeline.build [--servers en,cn] [--no-copilot]

Writes to NOVENA_OUT (default public/data/v1/). Layout:

    manifest.json                 build time, data version, each source's date
    common/usage.json             community usage, builds, investment (CN-sourced, shared by every server)
    {server}/operators.json       the operator index
    {server}/ops/{char id}.json   one operator's detail
    {server}/meta.json            level/EXP tables, branch and faction names, glossary terms
    {server}/ranges.json          attack ranges used by the operators
    {server}/items.json           items, recipes, sanity values (with this server's corrections)
    {server}/stages.json          farmable stages with drop rates, CE, supply zones and open days
    {server}/recruit.json         recruitment tags and pool
    {server}/upcoming.json        CN content not here yet, with estimated dates
    {server}/is.json              Integrated Strategies priorities per theme
    {server}/base.json            base skills: production, morale, dorms, Training Room and Workshop
    {server}/shops.json           event shops for events running or coming here
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

from novena_pipeline import OUT_DIR, SERVERS
from novena_pipeline import gamedata as gd
from novena_pipeline import items as items_mod
from novena_pipeline import shops as shops_mod
from novena_pipeline import base, guidebook, operators, recruit, roguelike, upcoming, usage
from novena_pipeline.sources import copilot, penguin, yituliu

DATA_VERSION = 1


def write(path: Path, data) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8", newline="\n")
    return len(text)


def log(msg: str) -> None:
    print(msg, flush=True)


def build_server(server: str, out: Path, usage_data: dict, jobs, yituliu_values: dict) -> dict:
    t0 = time.time()
    rec = recruit.build(server)
    builder = operators.Builder(server, {p["id"] for p in rec["pool"]}, set())
    ids = builder.ids()
    index, wanted, cost_table = [], set(), {}
    shutil.rmtree(out / server / "ops", ignore_errors=True)
    for cid in ids:
        index.append(builder.index_row(cid))
        detail = builder.detail(cid)
        for p in detail["phases"]:
            wanted |= {i for i, _ in p["cost"]}
        for lst in detail["skillUp"]:
            wanted |= {i for i, _ in lst}
        for s in detail["skills"]:
            for m in s["mastery"]:
                wanted |= {i for i, _ in m["cost"]}
        for m in detail["modules"]:
            for lst in m["cost"]:
                wanted |= {i for i, _ in lst}
        write(out / server / "ops" / f"{cid}.json", detail)
        cost_table[cid] = {
            "phases": [{"max": p["max"], "cost": p["cost"], "lmd": p["lmd"]} for p in detail["phases"]],
            "skillUp": detail["skillUp"],
            "skills": [{"mastery": [{"cost": m["cost"], "hours": m["hours"]} for m in sk["mastery"]]} for sk in detail["skills"]],
            "modules": [{"letter": m["letter"], "unlock": m["unlock"], "cost": m["cost"]} for m in detail["modules"]],
        }
    write(out / server / "operators.json", {"ops": index})
    write(out / server / "costs.json", cost_table)
    write(out / server / "ranges.json", operators.ranges(server, builder.ranges - {""}))
    write(out / server / "meta.json", {"const": operators.const(server), "branches": operators.branch_names(server),
                                       "factions": operators.faction_names(server), "terms": operators.terms(server)})
    write(out / server / "recruit.json", rec)
    log(f"  [{server}] {len(index)} operators ({time.time() - t0:.1f}s)")

    upcoming_data = upcoming.build(server, jobs, usage_data["ops"])
    shop_data = shops_mod.build(server, upcoming_data)
    wanted |= shops_mod.items(shop_data) | items_mod.extras(server)

    stages, fetched = penguin.load(server)
    recs = items_mod.recipes(server)
    for st in stages:  # furniture and other non-items drop out of the published rates
        st.drops = {i: r for i, r in st.drops.items() if i in gd.table("item_table", server)["items"] or i in gd.table("item_table", "cn")["items"]}
        wanted |= set(st.drops)
    stages = [st for st in stages if st.drops]
    for item, f in recs.items():
        wanted |= {item, *(i for i, _ in f["costs"])}
    wanted |= {"4001", *items_mod.EXP_CARDS}
    vals = items_mod.values_file(server, yituliu_values, stages, recs)
    wanted |= {i for i in vals["values"] if i != "EXP"}
    item_rows = items_mod.item_rows(server, wanted)
    write(out / server / "items.json", {"items": item_rows, "recipes": {k: v for k, v in recs.items() if k in item_rows},
                                        **vals, "potential": items_mod.potential_tokens(server)})
    write(out / server / "stages.json", items_mod.stages_file(server, stages, fetched))
    log(f"  [{server}] {len(item_rows)} items, {len(stages)} stages, {len(vals['corrections'])} value corrections")

    write(out / server / "upcoming.json", upcoming_data)
    write(out / server / "shops.json", shop_data)
    log(f"  [{server}] {len(shop_data['events'])} event shops")
    write(out / server / "is.json", roguelike.build(server))
    write(out / server / "base.json", base.build(server))
    log(f"  [{server}] done in {time.time() - t0:.1f}s")
    return {"penguin": int(fetched * 1000), "operators": len(index)}


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servers", default=",".join(SERVERS))
    ap.add_argument("--no-copilot", action="store_true", help="use the cached guides without asking for new ones")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args(argv)
    out: Path = args.out
    servers = [s for s in args.servers.split(",") if s]

    log("Community data")
    if not args.no_copilot:
        try:
            new, total = copilot.refresh(log=log)
            log(f"  MAA Copilot: {new} new guides, {total} total")
        except Exception as e:  # keep building on yesterday's guides rather than publish nothing
            if not copilot.CACHE.exists():
                raise
            log(f"  MAA Copilot refresh failed ({type(e).__name__}: {e}); using the cached guides")
    jobs = copilot.load()
    investment, survey_time = yituliu.investment()
    yituliu_values = yituliu.values()
    usage_data = usage.build(jobs, investment)
    write(out / "common" / "usage.json", usage_data)
    book = guidebook.build(jobs, usage_data["ops"])
    size = write(out / "common" / "guidebook.json", book)
    log(f"  guidebook: {len(book['guides'])} guides, {len(book['reqs'])} requirement profiles, {size / 1e6:.1f} MB")
    log(f"  usage for {len(usage_data['ops'])} operators from {len(jobs)} guides")

    manifest = {"version": DATA_VERSION, "built": int(time.time() * 1000), "servers": {},
                "sources": {"copilot": {"date": int(copilot.fetched_at() * 1000), "guides": len(jobs),
                                        "newest": max((j.id for j in jobs), default=0)},
                            "yituliu": {"date": survey_time},
                            "values": {"date": int(time.time() * 1000)},
                            "gamedata": {"date": int(time.time() * 1000)}}}
    previous = out / "manifest.json"
    if previous.exists():  # keep other servers' entries when building a subset
        manifest["servers"] = json.loads(previous.read_text(encoding="utf-8")).get("servers", {})
    for server in servers:
        log(f"Server {server}")
        gd.table.cache_clear()
        manifest["servers"][server] = build_server(server, out, usage_data, jobs, yituliu_values)
    write(out / "manifest.json", manifest)
    log("Done")


if __name__ == "__main__":
    main()
