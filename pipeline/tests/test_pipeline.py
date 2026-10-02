"""Pipeline unit tests on small, made-up inputs (no network, no cached tables)."""

from __future__ import annotations

from dtk_pipeline import text, usage
from dtk_pipeline.sources import copilot, values
from dtk_pipeline.sources.penguin import Stage
from dtk_pipeline.upcoming import featured


def test_fill_formats_like_the_game():
    bb = {"atk": 0.35, "Duration": 20, "cost": -2, "attack@atk_scale": 1.6}
    assert text.fill("ATK +{atk:0%} for {duration} s", bb) == "ATK +35% for 20 s"
    assert text.fill("DP {-cost}", bb) == "DP 2"
    assert text.fill("{attack@atk_scale:0%} damage", bb) == "160% damage"
    assert text.fill("{missing:0%}", bb) == "{missing:0%}"
    assert text.fill("{atk:0.0%}", {"atk": 0.075}) == "7.5%"


def test_markup_escapes_and_keeps_two_tags():
    out = text.markup("<@ba.vup>+20%</> and <$ba.stun>Stun</> <script>")
    assert out == '<b>+20%</b> and <i data-t="ba.stun">Stun</i> &lt;script&gt;'
    assert text.markup("unclosed <@ba.kw>tag") == "unclosed <b>tag</b>"
    assert text.plain("<@ba.vup>x</>") == "x"


def _job(jid, stage, views, *slots):
    return copilot.Job(jid, stage, views, [[copilot.OperUse(n, s, e, sl, m) for n, s, e, sl, m in slot] for slot in slots])


class FakeStages:
    def resolve(self, s):
        return s

    def category(self, s):
        return {"a": "main", "b": "main", "c": "event"}[s]


def test_usage_counts_every_stage_equally():
    jobs = [
        _job(1, "a", 0, [("X", 2, 2, 10, 1)], [("Y", 1, 0, 0, -1)]),
        _job(2, "a", 0, [("X", 2, 2, 10, 1)]),
        _job(3, "a", 0, [("X", 2, 0, 0, -1)]),
        _job(4, "b", 0, [("Y", 1, 0, 0, -1)]),
        _job(5, "b", 0, [("Y", 1, 0, 0, -1)]),
        _job(6, "b", 0, [("Y", 1, 0, 0, -1)]),
    ]
    u, totals = usage.compute_usage(jobs, FakeStages(), {"X": "char_x", "Y": "char_y"})
    assert totals["main"] == {"stages": 2, "guides": 6}
    # X: in all of stage a, none of b -> 50% of main; Y: one third of a, all of b
    assert abs(u["char_x"].by_category["main"] - 0.5) < 1e-9
    assert abs(u["char_y"].by_category["main"] - (1 / 3 + 1) / 2) < 1e-9
    assert u["char_x"].main_skill == 2
    assert u["char_x"].m3_share[2] == 1.0
    assert u["char_x"].main_module == "X"


def test_build_target_needs_half_of_clears_or_owners():
    u = usage.Usage(skill_share={2: 0.8, 1: 0.2}, m3_share={2: 0.3}, e2_share=0.4, module_share={"Y": 1.0})
    inv = {"e2": 0.9, "m3": {"2": 0.6}, "mod": {"X": 0.2}}
    assert usage.build_target(u, inv, 6) == {"elite": 2, "skill": 2, "mastery": 3, "module": "Y"}
    assert usage.build_target(u, None, 3) == {"skill": 2, "module": "Y"}


def test_value_correction_catches_a_cheap_outlier():
    vals = {"30011": 1.0, "30012": 4.0, "30013": 20.0, "30023": 21.0, "30033": 22.0, "30043": 2.0, "4001": 0.004}
    rarity = {"30011": 1, "30012": 2, "30013": 3, "30023": 3, "30033": 3, "30043": 3}
    stages = [Stage("s1", "1-1", 18, "MAIN", drops={"30013": 1.0}), Stage("s2", "1-2", 18, "MAIN", drops={"30023": 1.0}),
              Stage("s3", "1-3", 18, "MAIN", drops={"30033": 1.0}), Stage("s4", "1-4", 18, "MAIN", drops={"30043": 1.0})]
    fixes = values.server_corrections(vals, stages, {"31000": {"count": 1, "costs": [["30043", 2]], "lmd": 0}}, rarity)
    assert set(fixes) == {"30043"}  # the product isn't valued, so nothing else moves
    assert fixes["30043"][0] > 15


def test_featured_reads_each_banner_kind():
    assert featured({"gachaRuleType": "LIMITED", "limitParam": {"limitedCharId": "char_a"}}) == ["char_a"]
    assert featured({"gachaRuleType": "SPECIAL", "dynMeta": {"rarityPickCharDict": {"TIER_6": ["char_b", "char_c"]}}}) == ["char_b", "char_c"]
    assert featured({"gachaRuleType": "NORMAL", "gachaPoolDetail": "-"}) == []
