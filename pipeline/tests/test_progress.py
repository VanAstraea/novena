"""Story & events data (progress.py) on small, made-up tables (no network, no cached tables)."""

from __future__ import annotations

from novena_pipeline import progress
from novena_pipeline.progress import CHALLENGE, CHAR, OP, STORY, TRIAL


def _stage(code, zone, op=1, difficulty="NORMAL", story=False, chars=(), stage_type="MAIN"):
    rewards = [{"type": "DIAMOND", "id": "4002", "dropType": "COMPLETE"}] if op else []
    rewards += [{"type": "CHAR", "id": c, "dropType": "ONCE"} for c in chars]
    return {"code": code, "zoneId": zone, "diamondOnceDrop": op, "difficulty": difficulty, "isStoryOnly": story,
            "stageType": stage_type, "stageDropInfo": {"displayRewards": rewards, "displayDetailRewards": []}}


ARCHIVE = {
    "zoneToRetro": {"sub_1_zone1": "sub_1", "side_1_zone1": "side_1"},
    "stageList": {
        "a_st01": _stage("A-ST1", "sub_1_zone1", op=0, story=True),
        "a_01": _stage("A-1", "sub_1_zone1"),
        "a_01#f#": _stage("A-1", "sub_1_zone1", difficulty="FOUR_STAR"),
        "a_02": _stage("A-2", "sub_1_zone1"),
        "a_tr01": _stage("A-TR-1", "sub_1_zone1"),  # training: Originite Prime, but no trial stars
        "b_01": _stage("B-1", "side_1_zone1"),
        "b_02": _stage("B-2", "side_1_zone1", op=0),
    },
    "retroActList": {
        "side_1": {"type": "SIDESTORY", "index": 1, "name": "Side One", "linkedActId": ["act2side"], "haveTrail": False, "startTime": 0},
        "sub_1": {"type": "BRANCHLINE", "index": 1, "name": "Sub One", "linkedActId": ["act1d0"], "haveTrail": True, "startTime": 0},
    },
    "retroTrailList": {
        "sub_1": {"trailStartTime": 100, "stageList": ["a_st01", "a_01", "a_01#f#", "a_02"],
                  "trailRewardList": [
                      {"trailRewardId": "t1", "starCount": 4, "rewardItem": {"id": "char_x", "type": "CHAR"}},
                      {"trailRewardId": "t2", "starCount": 7, "rewardItem": {"id": "voucher_full_x", "type": "VOUCHER_FULL_POTENTIAL"}}]},
    },
}

ACTIVITY = {
    "basicInfo": {"act1d0": {"name": "First", "startTime": 10, "endTime": 20},
                  "act1sre": {"name": "First - Rerun", "startTime": 50, "endTime": 60},
                  "act2side": {"name": "Second", "startTime": 70, "endTime": 80}},
    "missionData": [
        {"missionGroup": "act1d0", "rewards": [{"type": "CHAR", "id": "char_x"}]},
        {"missionGroup": "act1sre", "rewards": [{"type": "CHAR", "id": "char_x"}, {"type": "GOLD", "id": "4001"}]},
        {"missionGroup": "act2side", "rewards": [{"type": "CHAR", "id": "char_y"}]},
    ],
    "activity": {"TYPE_ACT4D0": {"act0d0": {"mileStoneItemList": [{"item": {"id": "char_z", "type": "CHAR"}}]}}},
}


def test_trial_stars_count_three_per_stage_and_one_per_challenge():
    assert progress.stage_stars(_stage("A-1", "z")) == 3
    assert progress.stage_stars(_stage("A-1", "z", difficulty="FOUR_STAR")) == 1
    assert progress.stage_stars(_stage("A-ST1", "z", op=0, story=True)) == 0
    sub = next(r for r in progress.retros(ARCHIVE, {}) if r["id"] == "sub_1")
    assert sub["stars"] == 3 + 1 + 3  # the story stage adds nothing; the training stage isn't in the trial
    assert sub["op"] == 4  # A-1, its challenge mode, A-2 and the training stage


def test_stage_flags():
    assert progress.stage_flags("x", _stage("1-1", "main_1")) == OP
    assert progress.stage_flags("x#f#", _stage("1-1", "main_1", difficulty="FOUR_STAR")) == OP | CHALLENGE
    assert progress.stage_flags("st", _stage("ST", "main_1", op=0, story=True)) == STORY
    assert progress.stage_flags("x", _stage("1-7", "main_1", chars=["char_o"])) == OP | CHAR
    assert progress.stage_flags("x", _stage("2-10", "main_2", op=0, chars=["char_002_amiya"])) == 0  # everyone has her
    assert progress.stage_flags("x", _stage("A-1", "z"), {"x"}) == OP | TRIAL


def test_zones_count_originite_prime_and_skip_old_event_stages():
    stage_table = {"stages": {
        "main_01-01": _stage("1-1", "main_1"),
        "main_01-01#f#": _stage("1-1", "main_1", difficulty="FOUR_STAR"),
        "easy_01-01": _stage("1-1", "main_1", op=0),  # story mode: nothing once, left out
        "act4d0_01": _stage("SW-EV-1", "main_1", stage_type="ACTIVITY"),
        "wk_1": _stage("LS-1", "weekly_1", stage_type="DAILY"),
    }}
    zone_table = {"mainlineZoneIdList": ["main_1", "permanent_main_1_zone1"], "zones": {
        "main_1": {"type": "MAINLINE", "zoneNameFirst": "Episode 1", "zoneNameSecond": "Evil Time Part 2"},
        "permanent_main_1_zone1": {"type": "MAINLINE_RETRO"},
        "weekly_1": {"type": "WEEKLY", "zoneNameSecond": "Tactical Drill"},
    }}
    out = progress.zones(stage_table, zone_table)
    assert [(z["id"], z["kind"], z["name"], z["op"]) for z in out] == [("main_1", "main", "Episode 1", 2), ("weekly_1", "supply", "Tactical Drill", 1)]
    assert out[0]["stages"] == [["main_01-01", "1-1", OP], ["main_01-01#f#", "1-1", OP | CHALLENGE]]


def test_welfare_finds_trials_events_and_stages():
    event_chars = progress.mission_chars(ACTIVITY)
    assert event_chars == {"act1d0": ["char_x"], "act1sre": ["char_x"], "act2side": ["char_y"], "act0d0": ["char_z"]}
    retro_list = progress.retros(ARCHIVE, event_chars)
    assert [r["id"] for r in retro_list] == ["sub_1", "side_1"]  # Intermezzi first
    side = retro_list[1]
    assert side["trail"] is None and side["stars"] is None and side["char"] == "char_y"  # no trial yet: its event's operator
    zone_list = [{"id": "main_7", "stages": [["main_07-01", "7-2", OP | CHAR]]}]
    stages = {"main_07-01": _stage("7-2", "main_7", chars=["char_t"])}
    w = progress.welfare(zone_list, retro_list, event_chars, ACTIVITY["basicInfo"], stages)
    assert w["char_x"] == [{"kind": "retro", "id": "sub_1", "stars": 4},
                           {"kind": "event", "id": "act1sre", "name": "First - Rerun", "start": "1970-01-01T00:00:50Z", "end": "1970-01-01T00:01:00Z"}]
    assert w["char_y"][0] == {"kind": "retro", "id": "side_1", "stars": None}
    assert w["char_t"] == [{"kind": "stage", "stage": "main_07-01", "code": "7-2"}]
    assert "char_z" not in w  # its event isn't in basicInfo


def test_annihilation_sums_one_time_orundum():
    campaign_table = {"campaigns": {"camp_r_01": {"breakLadders": [
        {"rewards": [{"id": "4003", "count": 500}, {"id": "4001", "count": 4000}]}, {"rewards": [{"id": "4003", "count": 1000}]}]}},
        "campaignRotateStageOpenTimes": [{"stageId": "camp_r_01", "startTs": 0, "endTs": 60}]}
    out = progress.annihilation(campaign_table, {"stages": {"camp_r_01": {"name": "Outskirts", "code": "Kazimierz"}}})
    assert out == [{"id": "camp_r_01", "name": "Outskirts", "region": "Kazimierz", "orundum": 1500,
                    "rotation": ["1970-01-01T00:00:00Z", "1970-01-01T00:01:00Z"]}]
