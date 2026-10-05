from novena_pipeline.translations import english
from novena_pipeline.upcoming import add_english


def test_unofficial_english():
    assert english("月行水上") == "The Moon Walks on Water"
    assert english("Rhodes Island Epic 黑色博士坠落") == "Rhodes Island Epic: Black Doctor Down"
    assert english("菲亚梅塔特限证章") == "Exclusive Badge"
    assert english("月行水上复刻") == "The Moon Walks on Water (Rerun)"
    assert english("矢量突破#3 拟生态") == "Vector Breakthrough #3: Simulated Ecosystem"
    assert english("没有翻译") is None and english(None) is None


def test_official_names_win_and_gaps_are_listed():
    out = {"events": [{"name_cn": "月行水上"}, {"name_cn": "丛林症结", "name": "Official"}, {"name_cn": "没有翻译"}],
           "banners": [{"name_cn": "承诺"}], "modules": [], "cc": {"next": {"name_cn": "涤墨作战"}}}
    assert add_english(out) == ["没有翻译"]
    assert out["events"][0]["name_en"] == "The Moon Walks on Water" and "name_en" not in out["events"][1]
    assert out["banners"][0]["name_en"] == "Promise" and out["cc"]["next"]["name_en"] == "Battleplan Inkwash"
