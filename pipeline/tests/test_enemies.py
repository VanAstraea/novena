"""The enemy database on small, made-up tables."""

from __future__ import annotations

from novena_pipeline import enemies


def _v(value, defined=True):
    return {"m_defined": defined, "m_value": value}


def _level(level, attrs, **fields):
    names = ["maxHp", "atk", "def", "magicResistance", "moveSpeed", "attackSpeed", "baseAttackTime", "massLevel",
             "epResistance", "epDamageResistance", *enemies.IMMUNE]
    attributes = {k: _v(attrs[k]) if k in attrs else _v(0, False) for k in names}
    data = {"attributes": attributes}
    for k in ("applyWay", "motion", "enemyTags", "lifePointReduce", "rangeRadius"):
        data[k] = _v(fields[k]) if k in fields else _v(None, False)
    return {"level": level, "enemyData": data}


HANDBOOK = {
    "enemyData": {
        "enemy_b": {"enemyId": "enemy_b", "enemyIndex": "B1", "sortId": 2, "name": "Big Boss", "enemyLevel": "BOSS",
                    "damageType": ["PHYSIC", "MAGIC"], "hideInHandbook": False, "linkEnemies": ["enemy_a"],
                    "abilityList": [{"text": "Phase two", "textFormat": "TITLE"},
                                    {"text": "Attacks <$ba.stun>Stun</> the target", "textFormat": "SILENCE"},
                                    {"text": "Flying unit.", "textFormat": "NORMAL"}]},
        "enemy_a": {"enemyId": "enemy_a", "enemyIndex": "A1", "sortId": 1, "name": "Slug", "enemyLevel": "NORMAL",
                    "damageType": ["NO_DAMAGE"], "hideInHandbook": False, "abilityList": {}},
        "enemy_hidden": {"enemyId": "enemy_hidden", "sortId": 3, "name": "Secret", "hideInHandbook": True},
        "enemy_nodata": {"enemyId": "enemy_nodata", "sortId": 4, "name": "No stats", "hideInHandbook": False},
    },
    "raceData": {"sarkaz": {"id": "sarkaz", "raceName": "Sarkaz", "sortId": 1}},
}

DATABASE = {
    "enemy_a": [_level(0, {"maxHp": 550, "atk": 130, "moveSpeed": 0.5, "attackSpeed": 100, "baseAttackTime": 1.7},
                       applyWay="NONE", motion="WALK", lifePointReduce=1, rangeRadius=0.0)],
    "enemy_b": [
        _level(1, {"maxHp": 40000, "atk": 1500}),  # listed first on purpose: variants sort by level
        _level(0, {"maxHp": 30000, "atk": 1000, "def": 800, "magicResistance": 50.0, "moveSpeed": 0.6,
                   "attackSpeed": 200, "baseAttackTime": 3.0, "massLevel": 6, "epResistance": 10.0,
                   "stunImmune": True, "silenceImmune": True, "disarmedCombatImmune": True},
               applyWay="ALL", motion="FLY", enemyTags=["sarkaz"], lifePointReduce=10, rangeRadius=2.5),
    ],
    "enemy_hidden": [_level(0, {"maxHp": 1})],
}


def test_rows_follow_the_handbook_and_skip_hidden_or_statless_enemies():
    index, _ = enemies.build_from(HANDBOOK, DATABASE)
    assert [e["id"] for e in index["enemies"]] == ["enemy_a", "enemy_b"]
    assert index["races"] == {"sarkaz": "Sarkaz"}


def test_row_reads_types_and_stats():
    index, abilities = enemies.build_from(HANDBOOK, DATABASE)
    a, b = index["enemies"]
    assert a == {"id": "enemy_a", "name": "Slug", "code": "A1", "level": "NORMAL", "dmg": [], "atk": "none", "motion": "walk",
                 "lv": [{"hp": 550, "atk": 130, "def": 0, "res": 0, "wt": 0, "spd": 0.5, "rng": 0, "int": 1.7, "lp": 1, "imm": []}]}
    assert b["dmg"] == ["physical", "arts"] and b["atk"] == "both" and b["motion"] == "fly"
    assert b["tags"] == ["sarkaz"] and b["link"] == ["enemy_a"] and b["ab"] == 3
    lo, hi = b["lv"]
    assert lo == {"hp": 30000, "atk": 1000, "def": 800, "res": 50, "erst": 10, "wt": 6, "spd": 0.6, "rng": 2.5, "int": 1.5,
                  "lp": 10, "imm": ["stun", "silence", "disarm"]}
    # level 1 only lists HP and ATK; everything else comes from level 0
    assert hi == {**lo, "hp": 40000, "atk": 1500}
    assert "enemy_a" not in abilities


def test_abilities_keep_headings_silenceable_lines_and_glossary_terms():
    _, abilities = enemies.build_from(HANDBOOK, DATABASE)
    assert abilities["enemy_b"] == [["Phase two", "title"], ['Attacks <i data-t="ba.stun">Stun</i> the target', "silence"],
                                    ["Flying unit."]]
