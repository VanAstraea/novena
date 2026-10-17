"""Event shops, Training Room, Workshop, morale and dorm parsing (ported from ako)."""

from novena_pipeline import base, shops
from novena_pipeline.sources import eventshop


def test_shop_matches_its_event_and_original_beats_rerun():
    rows = [
        {"actName": "红丝绒·复刻", "actStore": [{"itemId": "30073", "itemPrice": 20, "itemQuantity": 1, "itemArea": 2}]},
        {"actName": "红丝绒", "actStore": [{"itemId": "30074", "itemPrice": 25, "itemQuantity": 2, "itemStock": 10, "itemArea": 1}]},
        {"actName": "不存在的活动", "actStore": [{"itemId": "1", "itemPrice": 1}]},
    ]
    found = shops.by_activity(eventshop.parse(rows), {"act1": {"name": "红丝绒"}, "act1re": {"name": "红丝绒", "isReplicate": True}})
    assert set(found) == {"act1"}
    offer = found["act1"].offers[0]
    assert (offer.item_id, offer.price, offer.quantity, offer.stock, offer.area) == ("30074", 25, 2, 10, 1)
    assert shops.base_name("红丝绒·复刻") == shops.base_name("红丝绒 复刻2") == "红丝绒"


def test_trainer_skills():
    branches = {"Besieger": "siegesniper"}
    assert base.parse_trainer("When this Operator is assigned as a Trainer, Sniper Operators' Specialization training speed +30%", branches) == [30.0, ["SNIPER"], None, None, 0.0]
    assert base.parse_trainer(
        "When this Operator is assigned as a Trainer, Sniper Operators' Specialization training speed +30%; "
        "if the trainee's Job Branch is Besieger, training speed will be further increased by +45%", branches) == [30.0, ["SNIPER"], "siegesniper", None, 45.0]
    assert base.parse_trainer(
        "When assigned as a Trainer, Guard and Defender Operators' Specialization training speed +25%; "
        "if training a skill to Specialization Level 3, training speed will be further increased by +45%", branches) == [25.0, ["TANK", "WARRIOR"], None, 3, 45.0]
    assert base.parse_trainer("When assigned as a Trainer, training speed +10% for each Sami Operator in the Base (caps at 3)", branches) is None
    assert base.parse_trainer("Morale consumption -0.25 per hour", branches) is None


def test_workshop_skills():
    assert base.parse_workshop("When this Operator is in the Workshop to process any material, byproduct rate +70%") == ["Any material", 70.0]
    assert base.parse_workshop("When in the Workshop to process Elite materials, byproduct rate +80%") == ["Elite materials", 80.0]
    assert base.parse_workshop("When in the Workshop to process Device-type materials, byproduct rate +100%") == ["Device", 100.0]
    assert base.parse_workshop("When in the Workshop, Morale cost of recipes -1") is None


def test_base_layout_flips_rows_and_keeps_passages_apart():
    def slot(category, row, col, h, w, storey="", cost=None):
        return {"category": category, "cleanCostId": cost or category, "offset": {"row": row, "col": col},
                "size": {"row": h, "col": w}, "storeyId": storey}
    b = {"layouts": {"v0": {"slots": {
        "slot_1": slot("OUTPUT", 0, 0, 2, 4, "B1"), "slot_2": slot("ELEVATOR", 0, 4, 2, 1, "B1"),
        "slot_3": slot("SPECIAL", 2, 5, 4, 8), "slot_4": slot("CORRIDOR", 0, 5, 2, 2, "B1", "CORRIDOR_P"),
        "slot_5": slot("CUSTOM_P", 0, 7, 2, 6, "B1"),
    }}}, "rooms": {"TRADING": {"phases": [{"maxStationedNum": 1}, {"maxStationedNum": 2}]}, "ELEVATOR": {"phases": [{"maxStationedNum": 0}]}}}
    out = base.layout(b)
    assert (out["rows"], out["cols"]) == (6, 13)
    assert out["slots"]["slot_3"] == [0, 5, 4, 8, ""]  # the top floor comes first
    assert out["slots"]["slot_1"] == [4, 0, 2, 4, "B1"]
    assert out["passages"] == [[4, 4, 2, 1], [4, 5, 2, 2, 1]]
    assert out["annex"] == ["slot_5"]
    assert out["capacity"] == {"TRADING": [1, 2]}
    assert base.layout({}) == {"rows": 0, "cols": 0, "slots": {}, "passages": [], "annex": [], "capacity": {}}


def test_morale_and_dorm_effects():
    infrast = {
        "Trade": {"skills": {"a": {"desc": ["进驻贸易站时，订单获取效率+20%，心情每小时消耗-0.25"]},
                             "b": {"desc": ["进驻贸易站时，贸易站内所有干员心情每小时消耗+0.25"]}}},
        "Control": {"skills": {"c": {"desc": ["进驻控制中枢时，控制中枢内所有干员的心情每小时恢复+0.05；其他设施内处于工作状态的干员心情每小时恢复+0.1"]}}},
        "Dorm": {"skills": {"d": {"desc": ["进驻宿舍时，该宿舍内所有干员的心情每小时恢复+0.15，当前宿舍每级为恢复效果额外+0.01"]},
                            "e": {"desc": ["进驻宿舍时，使该宿舍内心情未满的某个干员每小时恢复+0.65"]}}},
    }
    morale = base.morale_effects(infrast)
    assert morale["Trade"]["a"] == [-0.25, 0.0, 0.0]
    assert morale["Trade"]["b"] == [0.0, 0.25, 0.0]
    assert morale["Control"]["c"] == [0.0, -0.05, 0.1]
    dorm = base.dorm_effects(infrast)
    assert dorm["d"] == [0.15, 0.0, 0.0, 0.01] and dorm["e"] == [0.0, 0.65, 0.0, 0.0]


def test_dorm_scaled_skills_follow_dorm_levels():
    """Skills that grow with every level of every dorm become a formula of the base's dorm levels."""
    from novena_pipeline.base import dorm_scaled
    assert dorm_scaled("进驻制造站时，每间宿舍每级为贵金属类配方的生产力+1%") == (0.0, 1.0)
    assert dorm_scaled("进驻人力办公室时，人脉资源的联络速度+5%，每间宿舍每级额外+2%人脉资源的联络速度") == (5.0, 2.0)
    assert dorm_scaled("进驻发电站时，每间宿舍每级为充能速度额外+0.5%") == (0.0, 0.5)
    assert dorm_scaled("进驻会客室时，如果菲亚梅塔进驻在宿舍，则线索搜集速度额外提升10%") is None


def test_faction_rules_read_control_center_faction_effects():
    from novena_pipeline import base
    infrast = {"Control": {"skills": {
        "bs": {"desc": ["进驻控制中枢时，自身心情每小时消耗+0.5；每个进驻在制造站的黑钢国际干员，生产力+5%"]},
        "pine": {"desc": ["进驻控制中枢时，每个进驻在制造站的红松骑士团干员，作战记录类配方的生产力+10%，贵金属类配方的生产力-10%"]},
        "kj": {"desc": ["进驻控制中枢时，每个存在3名谢拉格干员的贸易站，订单获取效率+10%"]},
        "karlan": {"desc": ["进驻控制中枢时，每个进驻在贸易站的喀兰贸易干员，订单获取效率-15%，订单上限+6"]},
        "minos": {"desc": ["进驻控制中枢时，基建内（不包含副手及活动室使用者）每有1名米诺斯干员，会客室线索搜集速度+4%（最多+20%，同种效果取最高）；当与萨尔贡干员进驻控制中枢一起工作时，自身心情每小时消耗+0.02"]},
        "lgd": {"desc": ["当与龙门近卫局干员进驻控制中枢一起工作时，所有制造站生产力+3%（同种效果取最高）"]},
        "knight": {"desc": ["进驻控制中枢时，每个进驻在制造站的骑士干员生产力+7%"]},
        "flat": {"desc": ["进驻控制中枢时，所有制造站生产力+2%"]},
    }}}
    powers = {"黑钢国际": "blacksteel", "红松骑士团": "pinus", "谢拉格": "kjerag", "喀兰贸易": "karlan", "米诺斯": "minos", "龙门近卫局": "lgd"}
    assert base.faction_rules(infrast, powers) == {
        "bs": [{"k": "per", "f": "Mfg", "t": "blacksteel", "v": {"all": 5.0}}],
        "pine": [{"k": "per", "f": "Mfg", "t": "pinus", "v": {"CombatRecord": 10.0, "PureGold": -10.0}}],
        "kj": [{"k": "room", "f": "Trade", "t": "kjerag", "n": 3, "v": 10.0}],
        "minos": [{"k": "base", "f": "Reception", "t": "minos", "v": 4.0, "max": 20.0}],
        "lgd": [{"k": "with", "f": "Mfg", "t": "lgd", "v": 3.0}],
    }  # Karlan Trade changes the order limit, "Knight" isn't a faction, the flat buff is control_buffs'


def test_faction_trainers_count_a_faction_in_the_base():
    from novena_pipeline import base
    powers = {"Sami": "sami", "Abyssal Hunters": "abyssal"}
    sami = ("When this Operator is assigned to be the Trainer in the Training Room, Operators' Specialization training speed "
            "+10% for each <@cc.kw>Sami</> Operator in the Base (excluding Assistants and Activity Room users, caps at 3 Operators)")
    abyssal = ("When this Operator is assigned to be the Trainer in the Training Room, Morale consumed per hour +1, and Operators' "
               "Specialization training speed +10% for each Abyssal Hunter Operator in the Base (excluding Assistants and "
               "Activity Room users, caps at 5 Operators)")
    knight = ("When this Operator is assigned to be the Trainer in the Training Room, for each Knight Operator in the Base "
              "(excluding Assistants and Activity Room users), Operators' Specialization training speed +5% (caps at 5 Operators)")
    assert base.parse_faction_trainer(sami, powers) == ["sami", 10.0, 3]
    assert base.parse_faction_trainer(abyssal, powers) == ["abyssal", 10.0, 5]
    assert base.parse_faction_trainer(knight, powers) is None  # not a faction
    assert base.parse_trainer(sami, {}) is None  # and not a plain trainer either
