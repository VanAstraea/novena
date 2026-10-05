import json
from pathlib import Path

from novena_sync import payload

RAW = {
    "user": {
        "status": {"nickName": "Doctor", "uid": "12345678", "gold": 1_200_000, "diamondShard": 6300, "payDiamond": 2,
                   "freeDiamond": 40, "gachaTicket": 5, "tenGachaTicket": 1, "monthlySubscriptionEndTime": 1_900_000_000,
                   "secretary": "char_202_demkni"},
        "troop": {"chars": {
            "1": {"charId": "char_202_demkni", "evolvePhase": 2, "level": 90, "potentialRank": 2, "mainSkillLvl": 7,
                  "favorPoint": 25570, "skin": "char_202_demkni@test#1",
                  "skills": [{"skillId": "skchr_demkni_1", "specializeLevel": 0}, {"skillId": "skchr_demkni_2", "specializeLevel": 3}],
                  "equip": {"uniequip_002_demkni": {"level": 3, "locked": 0, "hide": 0}}},
            "2": {"charId": "char_002_amiya", "evolvePhase": 2, "level": 70, "potentialRank": 5, "mainSkillLvl": 7, "skills": [],
                  "tmpl": {"char_002_amiya": {"skillId": "x", "skills": [{"specializeLevel": 2}], "equip": {}},
                           "char_1001_amiya2": {"skills": [{"specializeLevel": 1}], "equip": {"uniequip_002_amiya2": {"level": 1, "locked": 1}}}}},
        }},
        "inventory": {"30073": 12, "30074": 0, "mod_unlock_token": 3},
        "consumable": {"ap_supply_lt_100": {"1": {"ts": 1_900_000_000, "count": 2}, "2": {"ts": 1_800_000_000, "count": 0}},
                       "voucher_skill_special_6": {"0": {"ts": -1, "count": 1, "extra": "x"}}},
        "friend": {"list": ["someone"]},
        "mailbox": {"x": 1},
        "pushFlags": {},
    }
}


def test_keeps_only_what_novena_reads():
    p = payload.minimize(RAW, "en")
    assert p["app"] == "novena-sync" and p["server"] == "en"
    assert set(p["user"]) == {"troop", "inventory", "status", "consumable"}
    assert p["user"]["consumable"] == {"ap_supply_lt_100": {"1": {"ts": 1_900_000_000, "count": 2}},
                                       "voucher_skill_special_6": {"0": {"ts": -1, "count": 1}}}
    assert "nickName" not in p["user"]["status"] and "uid" not in p["user"]["status"]
    saria = p["user"]["troop"]["chars"]["1"]
    assert set(saria) == {"charId", "evolvePhase", "level", "potentialRank", "mainSkillLvl", "skills", "equip"}
    assert saria["skills"] == [{"specializeLevel": 0}, {"specializeLevel": 3}]
    assert saria["equip"] == {"uniequip_002_demkni": {"level": 3, "locked": 0}}
    assert "friend" not in json.dumps(p) and "someone" not in json.dumps(p) and "Doctor" not in json.dumps(p)


def test_keeps_alternate_forms_and_drops_empty_items():
    p = payload.minimize(RAW, "en")
    amiya = p["user"]["troop"]["chars"]["2"]
    assert set(amiya["tmpl"]) == {"char_002_amiya", "char_1001_amiya2"}
    assert amiya["tmpl"]["char_1001_amiya2"]["equip"]["uniequip_002_amiya2"]["locked"] == 1
    assert p["user"]["inventory"] == {"30073": 12, "mod_unlock_token": 3}
    assert payload.summary(p) == "2 operators, 2 depot items"


def test_save_replaces_one_file_per_server(tmp_path: Path):
    first = payload.save(payload.minimize(RAW, "jp"), tmp_path)
    again = payload.save(payload.minimize(RAW, "jp"), tmp_path)
    assert first == again == tmp_path / "novena-sync-jp.json"
    assert [f.name for f in tmp_path.iterdir()] == ["novena-sync-jp.json"]
    assert json.loads(again.read_text(encoding="utf-8"))["server"] == "jp"


def test_fixture_for_the_website_is_current():
    """tests/fixtures/novena-sync.json (read by the website's importer test) must be what minimize() makes."""
    fixture = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "novena-sync.json"
    made = payload.minimize(RAW, "en")
    saved = json.loads(fixture.read_text(encoding="utf-8"))
    made.pop("synced"), saved.pop("synced")
    assert made == saved
