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


def test_enemy_stages_lists_visitable_stages_once_with_level_and_group():
    from novena_pipeline import enemy_stages as es
    stages = {"stages": {
        "main_01-07": {"stageId": "main_01-07", "levelId": "Obt/Main/level_main_01-07", "zoneId": "main_1", "code": "1-7", "name": "The Tyrant", "stageType": "MAIN", "difficulty": "NORMAL"},
        "main_01-07#f#": {"stageId": "main_01-07#f#", "levelId": "Obt/Main/level_main_01-07", "zoneId": "main_1", "code": "1-7", "name": "The Tyrant", "stageType": "MAIN", "difficulty": "FOUR_STAR"},
        "main_01-01": {"stageId": "main_01-01", "levelId": "Obt/Main/level_main_01-01", "zoneId": "main_1", "code": "1-1", "stageType": "MAIN", "isStoryOnly": True},
        "act9d0_01": {"stageId": "act9d0_01", "levelId": "Activities/ACT9D0/level_act9d0_01", "zoneId": "act17d5_zone1", "code": "DM-1", "name": "Buried", "stageType": "ACTIVITY", "difficulty": "NORMAL"},
        "camp_01": {"stageId": "camp_01", "levelId": "Obt/Campaign/level_camp_01", "zoneId": "camp_zone", "code": "Chernobog", "name": "Chernobog", "stageType": "CAMPAIGN"},
        "tower_1": {"stageId": "tower_1", "levelId": "Obt/Legion/level_tower_1", "code": "SSS", "stageType": "CLIMB_TOWER"},
        "act_multi": {"stageId": "act_multi", "levelId": "Activities/ACT1MULTI/level_m1", "zoneId": "x", "code": "M-1", "stageType": "ACTIVITY"},
    }}
    zones = {"zones": {"main_1": {"zoneNameFirst": "Episode 1"}}}
    acts = {"zoneToActivity": {"act17d5_zone1": "act17d5"}, "basicInfo": {"act17d5": {"name": "Darknights Memoir - Rerun"}}}
    hashes = {"obt/main/level_main_01-07.json": "h1", "obt/main/level_main_01-01.json": "h0", "activities/act9d0/level_act9d0_01.json": "h2",
              "obt/campaign/level_camp_01.json": "h3", "obt/legion/level_tower_1.json": "h4", "activities/act1multi/level_m1.json": "h5"}
    known = {"h0": [["enemy_a", 0]], "h1": [["enemy_a", 0], ["enemy_b", 1], ["enemy_unknown", 0]], "h2": [["enemy_a", 1]],
             "h3": [["enemy_b", 0]], "h4": [["enemy_a", 0]], "h5": [["enemy_a", 0]]}
    out = es.build_from(stages, zones, acts, hashes, known, {"enemy_a", "enemy_b"})
    assert out["groups"] == ["Episode 1", "Darknights Memoir", "Annihilation"]
    assert out["stages"] == [["1-7", "The Tyrant", 0], ["DM-1", "Buried", 1], ["Chernobog", "Chernobog", 2]]
    assert out["by"] == {"enemy_a": [[0, 0], [1, 1]], "enemy_b": [[0, 1], [2, 0]]}


def test_enemies_in_reads_a_level_file_enemy_list_once_per_level():
    from novena_pipeline import enemy_stages as es
    level = {"enemyDbRefs": [{"useDb": True, "id": "enemy_a", "level": 0}, {"id": "enemy_a", "level": 0}, {"id": "enemy_a", "level": 1}, {"id": None}]}
    assert es.enemies_in(level) == [["enemy_a", 0], ["enemy_a", 1]]
