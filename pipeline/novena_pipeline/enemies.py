"""The enemy database: every enemy in the game's handbook, with its stats at each level variant.

    {server}/enemies.json            {"races": {id: name}, "enemies": [row, ...]}
    {server}/enemy-abilities.json    {enemy id: [[html] or [html, "title" | "silence"], ...]}

A row: id, name, code (the handbook's index, "B2"), level (NORMAL/ELITE/BOSS), dmg (physical/arts/healing), atk
(melee/ranged/both/none), motion (walk/fly), tags (race ids, when any), ab (how many ability lines it has, when any),
link (enemies it comes with) and lv: one entry per level variant, each {hp, atk, def, res, erst?, edr?, wt, spd, rng,
int, lp, imm}. Stats come from levels/enemydata/enemy_database, where a variant lists only what differs from level 0.

The ability text is a file of its own (about half the total), so search and the list load only the index. An ability
line is plain, a heading ("title"), or one that Silence stops ("silence"). The handbook's lore descriptions and which
stages each enemy appears in are left out: stages are only in the per-stage level files (hundreds of them).
"""

from __future__ import annotations

from typing import Any

from novena_pipeline import gamedata as gd
from novena_pipeline.text import markup

DATABASE = "levels/enemydata/enemy_database"
DAMAGE = {"PHYSIC": "physical", "MAGIC": "arts", "HEAL": "healing"}
APPLY = {"MELEE": "melee", "RANGED": "ranged", "ALL": "both", "NONE": "none"}
# attribute -> the name the site uses
IMMUNE = {"stunImmune": "stun", "silenceImmune": "silence", "sleepImmune": "sleep", "frozenImmune": "frozen",
          "levitateImmune": "levitate", "fearedImmune": "fear", "palsyImmune": "palsy", "attractImmune": "attract",
          "disarmedCombatImmune": "disarm"}
FORMAT = {"TITLE": "title", "SILENCE": "silence"}


def _value(variant: dict, base: dict, path: tuple[str, ...]) -> Any:
    """A field of a level variant, or level 0's when the variant leaves it undefined."""
    def get(d: dict) -> dict | None:
        for p in path:
            d = (d or {}).get(p)
        return d
    own = get(variant)
    if own and own.get("m_defined"):
        return own.get("m_value")
    root = get(base)
    return root.get("m_value") if root else None


def _num(x: Any) -> int | float:
    x = float(x or 0)
    return int(x) if x == int(x) else round(x, 2)


def level_stats(variant: dict, base: dict) -> dict[str, Any]:
    a = lambda k: _value(variant, base, ("attributes", k))  # noqa: E731
    speed = a("attackSpeed") or 100
    out: dict[str, Any] = {
        "hp": _num(a("maxHp")), "atk": _num(a("atk")), "def": _num(a("def")), "res": _num(a("magicResistance")),
    }
    if a("epResistance"):
        out["erst"] = _num(a("epResistance"))
    if a("epDamageResistance"):
        out["edr"] = _num(a("epDamageResistance"))
    out |= {
        "wt": _num(a("massLevel")), "spd": _num(a("moveSpeed")), "rng": _num(_value(variant, base, ("rangeRadius",))),
        "int": _num(round((a("baseAttackTime") or 0) * 100 / speed, 2)), "lp": _num(_value(variant, base, ("lifePointReduce",))),
        "imm": [name for key, name in IMMUNE.items() if a(key)],
    }
    return out


def row(hb: dict, levels: list[dict]) -> tuple[dict[str, Any], list[list[str]]]:
    """(the index row, its ability lines)."""
    levels = sorted(levels, key=lambda lv: lv.get("level", 0))
    base = levels[0]["enemyData"]
    r: dict[str, Any] = {
        "id": hb["enemyId"], "name": hb.get("name") or hb["enemyId"], "code": hb.get("enemyIndex") or "",
        "level": hb.get("enemyLevel") or "NORMAL",
        "dmg": [DAMAGE[d] for d in hb.get("damageType") or [] if d in DAMAGE],
        "atk": APPLY.get(_value(base, base, ("applyWay",)) or "NONE", "none"),
        "motion": "fly" if _value(base, base, ("motion",)) == "FLY" else "walk",
    }
    tags = list(_value(base, base, ("enemyTags",)) or [])
    if tags:
        r["tags"] = tags
    abilities = []
    for ab in hb.get("abilityList") or []:
        text = markup(ab.get("text"))
        if text:
            kind = FORMAT.get(ab.get("textFormat") or "")
            abilities.append([text, kind] if kind else [text])
    if abilities:
        r["ab"] = len(abilities)
    if hb.get("linkEnemies"):
        r["link"] = list(hb["linkEnemies"])
    r["lv"] = [level_stats(lv["enemyData"], base) for lv in levels]
    return r, abilities


def build_from(handbook: dict, database: dict) -> tuple[dict[str, Any], dict[str, list]]:
    """(the index, the ability lines by enemy id)."""
    entries = handbook.get("enemyData", {})
    rows, abilities = [], {}
    for eid, hb in sorted(entries.items(), key=lambda kv: (kv[1].get("sortId", 0), kv[0])):
        if hb.get("hideInHandbook") or not database.get(eid):
            continue
        r, ab = row(hb, database[eid])
        rows.append(r)
        if ab:
            abilities[eid] = ab
    races = {k: v.get("raceName", k) for k, v in (handbook.get("raceData") or {}).items()}
    return {"races": races, "enemies": rows}, abilities


def build(server: str) -> tuple[dict[str, Any], dict[str, list]]:
    return build_from(gd.table("enemy_handbook_table", server), gd.level_file(DATABASE, server))
