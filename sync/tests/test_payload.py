import json
from pathlib import Path

from novena_sync import payload

RAW = {
    "user": {
        "status": {"nickName": "Doctor", "uid": "12345678", "gold": 1_200_000, "diamondShard": 6300, "payDiamond": 2,
                   "freeDiamond": 40, "gachaTicket": 5, "tenGachaTicket": 1, "monthlySubscriptionEndTime": 1_900_000_000,
                   "secretary": "char_202_demkni", "level": 87, "mainStageProgress": "main_14-05", "ap": 80, "maxAp": 135, "lastApAddTime": 1_800_000_000},
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
        "recruit": {"normal": {"slots": {
            "0": {"state": 2, "tags": [11, 14, 2, 10, 23], "selectTags": [{"tagId": 11, "pick": 1}, {"tagId": 14, "pick": 0}],
                  "startTs": 1_800_000_000, "durationInSec": 32400, "maxFinishTs": 1_800_032_400, "realFinishTs": 1_800_032_400},
            "1": {"state": 1, "tags": [1, 4, 9, 12, 17], "selectTags": [], "startTs": -1, "maxFinishTs": -1}}}},
        "building": {
            "status": {"labor": {"buffSpeed": 1.1, "processPoint": 0.5, "value": 120, "lastUpdateTime": 1_800_000_000, "maxValue": 200}},
            "chars": {"1": {"charId": "char_202_demkni", "roomSlotId": "slot_34", "ap": 4_320_000, "lastApAddTime": 1_800_000_000, "index": 0},
                      "2": {"charId": "char_002_amiya", "roomSlotId": "slot_1", "ap": 8_640_000, "lastApAddTime": 1_800_000_000, "index": 0}},
            "roomSlots": {"slot_34": {"level": 3, "state": 2, "roomId": "MANUFACTURE", "charInstIds": [1, -1, -1]},
                          "slot_1": {"level": 5, "state": 2, "roomId": "DORMITORY", "charInstIds": [2, -1, -1, -1, -1]},
                          "slot_9": {"level": 1, "state": 2, "roomId": "ELEVATOR", "charInstIds": []}},
            "rooms": {"MANUFACTURE": {"slot_34": {"formulaId": "4", "outputSolutionCnt": 7, "capacity": 54, "remainSolutionCnt": 3,
                                                  "completeWorkTime": 1_800_010_000, "lastUpdateTime": 1_800_000_000}},
                      "DORMITORY": {"slot_1": {"comfort": 5000, "diySolution": {"wallPaper": "x"}}}},
            "furniture": {"x": 1}, "visitor": {"name": "a friend"}},
        "dungeon": {
            "stages": {
                "main_00-01": {"stageId": "main_00-01", "completeTimes": 3, "startTimes": 4, "practiceTimes": 0, "state": 3, "hasBattleReplay": 1, "noCostCnt": 0},
                "main_00-02": {"stageId": "main_00-02", "completeTimes": 1, "startTimes": 1, "practiceTimes": 0, "state": 2, "hasBattleReplay": 0, "noCostCnt": 0},
                "main_00-03": {"stageId": "main_00-03", "completeTimes": 0, "startTimes": 2, "practiceTimes": 0, "state": 1, "hasBattleReplay": 0, "noCostCnt": 0},
                "act9d0_01": {"stageId": "act9d0_01", "completeTimes": 7, "startTimes": 7, "practiceTimes": 0, "state": 3, "hasBattleReplay": 1, "noCostCnt": 0},
                "act9d0_ex01#f#": {"stageId": "act9d0_ex01#f#", "completeTimes": 1, "startTimes": 9, "practiceTimes": 2, "state": 2, "hasBattleReplay": 1, "noCostCnt": 0},
            },
            "cowLevel": {"x": 1}, "hideStages": {"y": 1}, "mainlineBannedStages": [],
        },
        "retro": {"coin": 4, "supplement": 1, "lst": 1_800_000_000, "nst": 1_800_600_000,
                  "block": {"permanent_sub_1_Darknights_Memoir": {"locked": 0, "open": 1},
                            "permanent_sidestory_4_Twilight_Of_Wolumonde": {"locked": 1, "open": 0}},
                  "trail": {"permanent_sub_1_Darknights_Memoir": {"trailReward_sub_1_1": 1, "trailReward_sub_1_2": 0},
                            "permanent_sidestory_4_Twilight_Of_Wolumonde": {}}},
        "campaignsV2": {"campaignCurrentFee": 1200, "campaignTotalFee": 1800, "lastRefreshTs": 1_800_000_000,
                        "instances": {"camp_r_31": {"maxKills": 360, "rewardStatus": [1, 1, 1, 1, 1, 1, 0, 0]}},
                        "open": {"permanent": ["camp_01"], "training": []}, "missions": {"m": 1}, "sweepMaxKills": {"camp_r_31": 360}},
        "friend": {"list": ["someone"]},
        "mailbox": {"x": 1},
        "pushFlags": {},
    }
}


def test_keeps_only_what_novena_reads():
    p = payload.minimize(RAW, "en")
    assert p["app"] == "novena-sync" and p["server"] == "en"
    assert set(p["user"]) == {"troop", "inventory", "status", "consumable", "recruit", "building"}
    assert p["user"]["consumable"] == {"ap_supply_lt_100": {"1": {"ts": 1_900_000_000, "count": 2}},
                                       "voucher_skill_special_6": {"0": {"ts": -1, "count": 1}}}
    assert "nickName" not in p["user"]["status"] and "uid" not in p["user"]["status"]
    saria = p["user"]["troop"]["chars"]["1"]
    assert set(saria) == {"charId", "evolvePhase", "level", "potentialRank", "mainSkillLvl", "skills", "equip", "skin"}
    assert saria["skin"] == "char_202_demkni@test#1" and "skin" not in p["user"]["troop"]["chars"]["2"]
    assert saria["skills"] == [{"specializeLevel": 0}, {"specializeLevel": 3}]
    assert saria["equip"] == {"uniequip_002_demkni": {"level": 3, "locked": 0}}
    assert "friend" not in json.dumps(p) and "someone" not in json.dumps(p) and "Doctor" not in json.dumps(p)


def test_keeps_alternate_forms_and_drops_empty_items():
    p = payload.minimize(RAW, "en")
    amiya = p["user"]["troop"]["chars"]["2"]
    assert set(amiya["tmpl"]) == {"char_002_amiya", "char_1001_amiya2"}
    assert amiya["tmpl"]["char_1001_amiya2"]["equip"]["uniequip_002_amiya2"]["locked"] == 1
    assert p["user"]["inventory"] == {"30073": 12, "mod_unlock_token": 3}
    assert payload.summary(p) == "2 operators, 2 depot items, 2 base rooms"


def test_save_replaces_one_file_per_server(tmp_path: Path):
    first = payload.save(payload.minimize(RAW, "jp"), tmp_path)
    again = payload.save(payload.minimize(RAW, "jp"), tmp_path)
    assert first == again == tmp_path / "novena-sync-jp.json"
    assert [f.name for f in tmp_path.iterdir()] == ["novena-sync-jp.json"]
    assert json.loads(again.read_text(encoding="utf-8"))["server"] == "jp"


def test_fixture_for_the_website_is_current():
    """tests/fixtures/novena-sync.json (read by the website's importer test) must be what minimize() makes."""
    fixture = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "novena-sync.json"
    made = payload.minimize(RAW, "en", progress=True)
    saved = json.loads(fixture.read_text(encoding="utf-8"))
    made.pop("synced"), saved.pop("synced")
    assert made == saved


def test_recruitment_base_and_sanity():
    u = payload.minimize(RAW, "en")["user"]
    assert u["recruit"] == [
        {"slot": 0, "state": 2, "tags": [11, 14, 2, 10, 23], "picked": [11], "start": 1_800_000_000, "finish": 1_800_032_400},
        {"slot": 1, "state": 1, "tags": [1, 4, 9, 12, 17], "picked": [], "start": -1, "finish": -1},
    ]
    rooms = {r["room"]: r for r in u["building"]["rooms"]}
    assert set(rooms) == {"MANUFACTURE", "DORMITORY"}  # corridors and the elevator aren't rooms anyone works in
    assert rooms["MANUFACTURE"] == {"slot": "slot_34", "room": "MANUFACTURE", "level": 3, "formula": "4", "made": 7, "capacity": 54,
                                    "remain": 3, "done": 1_800_010_000, "team": [{"charId": "char_202_demkni", "morale": 12.0, "ts": 1_800_000_000}]}
    assert rooms["DORMITORY"]["comfort"] == 5000 and rooms["DORMITORY"]["team"][0]["morale"] == 24.0
    assert u["building"]["drones"] == {"value": 120, "max": 200, "ts": 1_800_000_000, "speed": 1.1}
    assert {k: u["status"][k] for k in ("ap", "maxAp", "lastApAddTime")} == {"ap": 80, "maxAp": 135, "lastApAddTime": 1_800_000_000}
    text = json.dumps(u)
    assert "a friend" not in text and "wallPaper" not in text and "furniture" not in text


def test_shape_has_keys_but_no_values():
    s = json.dumps(payload.shape(RAW))
    assert '"tags": ["int"]' in s and "roomSlots" in s
    assert "1800000000" not in s and "char_202_demkni" not in s and "a friend" not in s


PROGRESS_KEYS = {"dungeon", "retro", "campaignsV2"}


def test_progress_is_left_out_unless_chosen():
    p = payload.minimize(RAW, "en")
    assert p["version"] == 3
    assert not PROGRESS_KEYS & set(p["user"])
    assert "level" not in p["user"]["status"] and "mainStageProgress" not in p["user"]["status"]
    text = json.dumps(p)
    assert "main_00-01" not in text and "Darknights" not in text and "camp_r_31" not in text


def test_progress_when_chosen_is_trimmed_to_this():
    u = payload.minimize(RAW, "en", progress=True)["user"]
    assert u["dungeon"] == {"stages": {"main_00-01": 3, "main_00-02": 2, "act9d0_01": 3, "act9d0_ex01#f#": 2}}
    assert u["retro"] == {"coin": 4, "block": {"permanent_sub_1_Darknights_Memoir": 1},
                          "trail": {"permanent_sub_1_Darknights_Memoir": ["trailReward_sub_1_1"]}}
    assert u["campaignsV2"] == {"fee": [1200, 1800], "ts": 1_800_000_000,
                                "instances": {"camp_r_31": {"maxKills": 360, "rewardStatus": [1, 1, 1, 1, 1, 1, 0, 0]}}}
    assert u["status"]["level"] == 87 and u["status"]["mainStageProgress"] == "main_14-05"
    assert payload.summary({"user": u}) == "2 operators, 2 depot items, 2 base rooms, 4 stages cleared"


def test_progress_carries_no_play_history():
    text = json.dumps(payload.minimize(RAW, "en", progress=True))
    for key in ("completeTimes", "startTimes", "practiceTimes", "hasBattleReplay", "noCostCnt", "cowLevel", "hideStages",
                "supplement", "lst", "nst", "missions", "sweepMaxKills", "open", "nickName", "uid", "secretary"):
        assert f'"{key}"' not in text, key
    assert "someone" not in text and "Doctor" not in text and "1800600000" not in text


def test_shape_has_progress_keys_but_no_values():
    s = payload.shape(RAW)
    assert s["campaignsV2"]["instances"]["camp_r_31"] == {"maxKills": "int", "rewardStatus": ["int"]}
    assert s["status"] == {"mainStageProgress": "str", "level": "int"}
    assert len(s["dungeon"]["stages"]) == 3  # a sample, not every stage
    text = json.dumps(s)
    assert "1800000000" not in text and "1200" not in text and "main_14-05" not in text
