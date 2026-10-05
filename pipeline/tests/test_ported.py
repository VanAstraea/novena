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
