"""Upcoming: story-only celebration events, overdue estimates, the Arknights Terra Wiki's dates and key operators'
alternatives (made-up inputs)."""

from __future__ import annotations

import os
import time
import urllib.error
from datetime import date, datetime, timezone

from novena_pipeline import upcoming
from novena_pipeline.sources import wikigg
from novena_pipeline.sources.copilot import Job, OperUse
from novena_pipeline.usage import slot_alternatives

# Trimmed from the wiki's rendered markup: a heading, then one of its tables (event cell, date cell).
EVENT_PAGE = """<div class="mw-parser-output">
<h3><span class="mw-headline" id="Ongoing/upcoming">Ongoing/upcoming</span><span class="mw-editsection"><span class="mw-editsection-bracket">[</span><a href="/wiki/Event?action=edit&amp;section=2"><span>edit</span></a><span class="mw-editsection-bracket">]</span></span></h3>
<table class="mrfz-wtable flex-table"><tbody><tr><th>Event</th><th>Date</th></tr>
<tr><td style="padding:0;"><div><div><b><a href="/wiki/People,_A_People" title="People, A People"><span>&#91;Side Story&#93;&#32;People, A People</span></a></b></div></div></td>
<td><div><div><b>CN:</b>&#32;2026/04/07&#32;&#8211;&#32;2026/04/21</div><div><b>Global:</b>&#32;2026/09/16&#32;&#8211;&#32;2026/09/30<div class="countdown" style="display:none;">&#59;&#32;starts in&#32;<span class="countdowndate">2026-09-16T15:00:00+00:00</span></div></div></div></td></tr>
<tr><td style="padding:0;"><div><div><b><a href="/wiki/Critical_Phase_Transition" title="Critical Phase Transition"><span>&#91;Celebration&#93;&#32;Critical Phase Transition</span></a></b></div></div></td>
<td><div><div><b>CN:</b>&#32;2026/05/01&#32;&#8211;&#32;2026/05/15</div><div><b>Global:</b>&#32;2026/10/14&#32;&#8211;&#32;2026/10/28</div></div></td></tr>
</tbody></table>
<h3><span class="mw-headline" id="By_year">By year</span></h3>
<table class="mrfz-wtable"><tbody><tr><td><b><a href="/wiki/Old">Old</a></b></td><td><b>CN:</b> 2019/05/01 &#8211; 2019/05/15</td></tr></tbody></table>
</div>"""

UPCOMING_PAGE = """<div class="mw-parser-output"><h2><span class="mw-headline" id="List">List</span></h2>
<table class="mrfz-wtable"><tbody><tr><th>Event</th><th>CN date</th></tr>
<tr><td><div><b><a href="/wiki/When_Elegies_Are_Ashes_Rerun"><span>&#91;Rerun&#93;&#32;When Elegies Are Ashes Rerun</span></a></b></div></td><td>2026/03/27&#8211;2026/04/06</td></tr>
<tr><td><div><b><a href="/wiki/Duel_Channel_Ivy_Vine"><span>Duel Channel: Ivy Vine</span></a></b></div></td><td>2026/04/25&#8211;2026/05/09</td></tr>
<tr><td><div><b><a href="/wiki/Contingency_Contract_Obliteration"><span>Contingency Contract Obliteration</span></a></b></div></td><td>2026/06/26&#8211;2026/07/10</td></tr>
</tbody></table><h3><span class="mw-headline" id="Future">Future</span></h3><ul><li>A new season.</li></ul></div>"""

BANNER_PAGE = """<div class="mw-parser-output"><h2><span class="mw-headline" id="Limited_Headhunting">Limited Headhunting</span></h2>
<table class="mrfz-wtable flex-table"><tbody><tr><th>Banner</th><th>Rate-Up Operators</th></tr>
<tr><td style="padding:0;"><div class="banner"><div><b>&#91;Celebration&#93;&#32;A Shared Oath of Guardianship</b></div></div><div><div><b>CN date:</b> 2025/11/01 &#8211; 2025/11/15</div><div><b>Global date:</b> 2026/04/14 &#8211; 2026/04/28</div></div></td>
<td><div class="character-tooltip" data-star="6" data-name="Saga"></div></td></tr></tbody></table>
<h2><span class="mw-headline" id="Kernel_Headhunting">Kernel Headhunting</span></h2>
<table class="mrfz-wtable flex-table"><tbody><tr><th>Banner</th><th>Rate-Up Operators</th></tr>
<tr><td><div class="banner"><div><b>Kernel #61 (Global)</b></div></div></td><td><div class="character-tooltip" data-star="6" data-name="Ifrit"></div></td></tr></tbody></table></div>"""


def _wiki() -> wikigg.Wiki:
    events = [r for r in wikigg.parse("Event", EVENT_PAGE) if r.section == "Ongoing/upcoming"]
    events += wikigg.parse("Event/Upcoming", UPCOMING_PAGE)
    return wikigg.Wiki(events, wikigg.parse("Headhunting/Banners/2026", BANNER_PAGE), 0.0)


def test_wiki_rows_read_names_dates_and_countdowns():
    rows = wikigg.parse("Event", EVENT_PAGE)
    people, cpt, old = rows
    assert (people.section, people.tag, people.name) == ("Ongoing/upcoming", "Side Story", "People, A People")
    assert people.cn == (date(2026, 4, 7), date(2026, 4, 21)) and people.glob == (date(2026, 9, 16), date(2026, 9, 30))
    assert people.starts == "2026-09-16T15:00:00+00:00" and people.url == "https://arknights.wiki.gg/wiki/People,_A_People"
    assert cpt.name == "Critical Phase Transition" and cpt.starts is None and cpt.glob[0] == date(2026, 10, 14)
    assert old.section == "By year"
    elegies, duel, cc = wikigg.parse("Event/Upcoming", UPCOMING_PAGE)
    assert elegies.tag == "Rerun" and duel.name == "Duel Channel: Ivy Vine"
    assert duel.cn == (date(2026, 4, 25), date(2026, 5, 9)) and duel.glob is None
    oath, = wikigg.parse("Headhunting/Banners/2026", BANNER_PAGE)  # the Global-only Kernel row has no CN date
    assert wikigg.banner_kind(oath) == "limited" and oath.glob == (date(2026, 4, 14), date(2026, 4, 28))
    assert oath.url == "https://arknights.wiki.gg/wiki/Headhunting/Banners/2026"
    kinds = {tag: wikigg.banner_kind(wikigg.Row("", "List", tag, "x", "", None, None)) for tag in
             ("Limited Headhunting ‐ Crossover", "Limited Headhunting ‐ Carnival", "Standard Headhunting - Limited-Time", "Kernel Headhunting")}
    assert kinds == {"Limited Headhunting ‐ Crossover": "collab", "Limited Headhunting ‐ Carnival": "limited",
                     "Standard Headhunting - Limited-Time": None, "Kernel Headhunting": "kernel"}
    assert wikigg.valid(EVENT_PAGE) and not wikigg.valid("<html>Blocked: Games</html>")


def test_wiki_rows_match_by_cn_day_and_name():
    row = lambda name, day, glob=None: wikigg.Row("Event", "", "", name, "", (day, None), glob)
    a, b = row("Alpha", date(2026, 5, 1)), row("Beta", date(2026, 5, 1))
    assert upcoming.wiki_row([a], date(2026, 5, 1)) is a
    assert upcoming.wiki_row([a], date(2026, 5, 2)) is None
    assert upcoming.wiki_row([a, b], date(2026, 5, 1)) is None  # two events that day and no name to tell them apart
    assert upcoming.wiki_row([a, b], date(2026, 5, 1), "beta!") is b
    dated = row("Alpha", date(2026, 5, 1), (date(2026, 10, 14), None))
    assert upcoming.wiki_row([a, dated], date(2026, 5, 1)) is dated  # listed on both pages: the dated one wins
    # CN's 07:00 on May 1 (UTC+8) is still April 30 in UTC
    assert upcoming.cn_day("2026-04-30T23:00:00Z") == date(2026, 5, 1)


def _out() -> dict:
    return {"events": [
        {"id": "act4mainss", "name_cn": "相变临界", "cn_start": "2026-04-30T23:00:00Z", "eta": "2026-10-10T23:00:00Z", "confirmed": False},
        {"id": "act51side", "name_cn": "辟路之人", "cn_start": "2026-04-06T20:00:00Z", "eta": "2026-09-16T15:00:00Z", "name": "People, A People", "confirmed": True},
        {"id": "act9duel", "name_cn": "对决频道", "cn_start": "2026-04-24T20:00:00Z", "eta": "2026-10-01T00:00:00Z", "confirmed": False},
        {"id": "act1rerun", "name_cn": "复刻", "cn_start": "2026-03-26T20:00:00Z", "eta": "2026-09-01T00:00:00Z", "confirmed": False}],
        "banners": [{"id": "LIMITED_67_0_1", "name_cn": "以风雪为誓", "kind": "limited", "cn_open": "2025-10-31T20:00:00Z", "eta": "2026-04-10T00:00:00Z"},
                    {"id": "SPECIAL_1", "name_cn": "定向甄选", "kind": "special", "cn_open": "2025-10-31T20:00:00Z", "eta": "2026-04-10T00:00:00Z"}],
        "modules": [], "cc": {"next": {"id": "cc1", "name_cn": "未知", "cn_start": "2026-06-25T20:00:00Z", "eta": "2026-09-01T00:00:00Z", "overdue": True}}}


def test_wiki_dates_and_names_replace_estimates():
    out = _out()
    upcoming.add_wiki(out, "en", _wiki())
    cpt, people, duel, rerun = out["events"]
    assert cpt["eta"] == "2026-10-14T15:00:00Z" and cpt["end"] == "2026-10-28T10:59:59Z" and cpt["dated_by"] == "wiki"
    assert cpt["name_en"] == "Critical Phase Transition" and cpt["name_by"] == "wiki"
    assert cpt["wiki"] == "https://arknights.wiki.gg/wiki/Critical_Phase_Transition"
    assert people["eta"] == "2026-09-16T15:00:00Z" and "dated_by" not in people and "name_en" not in people  # the game's own date and name
    assert duel["name_en"] == "Duel Channel: Ivy Vine" and duel["eta"] == "2026-10-01T00:00:00Z" and "dated_by" not in duel  # no Global date yet
    assert "wiki" not in rerun  # rerun rows don't stand in for first runs
    oath, special = out["banners"]
    assert oath["name_en"] == "A Shared Oath of Guardianship" and oath["eta"] == "2026-04-14T15:00:00Z" and oath["dated_by"] == "wiki"
    assert "wiki" not in special
    cc = out["cc"]["next"]
    assert cc["name_en"] == "Contingency Contract Obliteration" and cc["overdue"] and "dated_by" not in cc

    jp = _out()
    upcoming.add_wiki(jp, "jp", _wiki())
    assert jp["events"][0]["eta"] == "2026-10-14T07:00:00Z" and jp["events"][0]["end"] == "2026-10-28T02:59:59Z"
    cn = _out()
    upcoming.add_wiki(cn, "cn", _wiki())
    assert "wiki" not in cn["events"][0]


def test_wiki_countdown_is_exact():
    wiki = _wiki()
    out = {"events": [{"id": "act51side", "name_cn": "辟路之人", "cn_start": "2026-04-06T20:00:00Z", "eta": "2026-09-20T00:00:00Z", "confirmed": False}],
           "banners": [], "modules": [], "cc": {"next": None}}
    upcoming.add_wiki(out, "kr", wiki)
    assert out["events"][0]["eta"] == "2026-09-16T07:00:00Z"


def test_wiki_names_skip_the_translation_list():
    out = _out()
    upcoming.add_wiki(out, "en", _wiki())
    upcoming.add_english(out)
    assert out["events"][0]["name_en"] == "Critical Phase Transition"


def test_passed_estimates_are_overdue():
    now = datetime(2026, 10, 6, tzinfo=timezone.utc).timestamp()
    out = {"events": [{"eta": "2026-10-01T00:00:00Z", "confirmed": False}, {"eta": "2026-10-01T00:00:00Z", "confirmed": True},
                      {"eta": "2026-10-01T00:00:00Z", "dated_by": "wiki"}, {"eta": "2026-10-20T00:00:00Z", "confirmed": False}],
           "banners": [{"eta": "2026-09-30T00:00:00Z"}]}
    upcoming.mark_overdue(out, now)
    assert [e["overdue"] for e in out["events"]] == [True, False, False, False] and out["banners"][0]["overdue"]


def test_story_celebration_events_count_but_main_story_does_not(monkeypatch):
    tables = {
        "activity_table": {"zoneToActivity": {"act4mainss_zone1": "act4mainss", "main_14": "act1mainss", "act51side_zone1": "act51side"},
                           "basicInfo": {"act4mainss": {"type": "TYPE_MAINSS"}, "act1mainss": {"type": "YEAR_5_GENERAL"},
                                         "act51side": {"type": "TYPE_ACT51SIDE"}}},
        "stage_table": {"stages": {
            "act4mainss_01": {"zoneId": "act4mainss_zone1", "stageType": "MAIN"},
            "act4mainss_s01": {"zoneId": "act4mainss_zone1", "stageType": "SUB"},
            "act4mainss_st01": {"zoneId": "act4mainss_zone1", "stageType": "SPECIAL_STORY"},
            "main_14-01": {"zoneId": "main_14", "stageType": "MAIN"},
            "act51side_01": {"zoneId": "act51side_zone1", "stageType": "ACTIVITY"},
            "act51side_st01": {"zoneId": "act51side_zone1", "stageType": "MAIN"},
            "main_01-01": {"zoneId": "main_1", "stageType": "MAIN"}}},
    }
    monkeypatch.setattr(upcoming.gd, "table", lambda name, server: tables[name])
    assert upcoming.event_stages("cn") == {"act4mainss": {"act4mainss_01", "act4mainss_s01"}, "act51side": {"act51side_01"}}


def test_wiki_cache_survives_a_bad_or_failed_fetch(monkeypatch, tmp_path):
    monkeypatch.setattr(wikigg, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(wikigg, "OFFLINE", False)
    monkeypatch.setattr(wikigg.time, "sleep", lambda s: None)
    cached = tmp_path / "sources" / "wikigg_Event.html"
    cached.parent.mkdir()
    cached.write_text(EVENT_PAGE, encoding="utf-8")
    day_old = time.time() - 86400
    os.utime(cached, (day_old, day_old))

    monkeypatch.setattr(wikigg, "get_bytes", lambda *a, **k: b"<html>Blocked: Games</html>")
    f = wikigg.Fetcher()
    assert f.page("Event") == EVENT_PAGE and f.down  # a block page never replaces the copy

    def fail(*a, **k):
        raise urllib.error.URLError("certificate verify failed")
    monkeypatch.setattr(wikigg, "get_bytes", fail)
    f = wikigg.Fetcher()
    assert f.page("Event") == EVENT_PAGE and "URLError" in f.down
    assert f.page("Event/Upcoming") is None  # nothing cached and the wiki down: no second try this run
    week_old = time.time() - 8 * 86400
    os.utime(cached, (week_old, week_old))
    assert wikigg.Fetcher().page("Event") is None  # too old to date anything


class _Stages:
    def resolve(self, stage: str) -> str:
        return stage


def _job(i: int, stage: str, *slots: tuple[str, ...], views: int = 0) -> Job:
    return Job(i, stage, views, [[OperUse(n, 0, 0, 0, -1) for n in slot] for slot in slots])


def test_slot_alternatives_count_what_shares_a_slot():
    names = {n: f"char_{n}" for n in ("saria", "nearl", "shu", "exu", "kroos", "fang")}
    jobs = [
        _job(1, "a-1", ("saria", "nearl"), ("exu",)),
        _job(2, "a-1", ("saria", "nearl", "shu", "unknown"), ("exu",)),
        _job(3, "a-2", ("saria",), ("exu", "kroos")),
        _job(4, "a-2", ("saria",), ("fang",)),
        _job(5, "b-1", ("saria", "shu"), ("exu",)),  # another event's stage
    ]
    got = slot_alternatives(jobs, {"a-1", "a-2"}, _Stages(), names, ["char_saria", "char_exu", "char_fang", "char_none"])
    assert got["char_saria"] == {"flex": 0.5, "alts": [["char_nearl", 0.5], ["char_shu", 0.25]]}
    assert got["char_exu"] == {"flex": 0.33, "alts": [["char_kroos", 0.333]]}
    assert got["char_fang"] == {"flex": 0.0, "alts": []}  # always a fixed pick
    assert "char_none" not in got  # in no guide for these stages
    weighted = slot_alternatives([_job(1, "a-1", ("saria", "nearl"), views=1000), _job(2, "a-1", ("saria", "shu"))],
                                 {"a-1"}, _Stages(), names, ["char_saria"])
    assert weighted["char_saria"]["alts"][0][0] == "char_nearl"  # the more viewed guide counts for more


def test_alternatives_fall_back_to_the_archetype_when_guides_name_few(monkeypatch):
    monkeypatch.setattr(upcoming.gd, "is_playable", lambda cid, e: True)
    chars = {"char_saria": {"subProfessionId": "guardian"}, "char_nearl": {"subProfessionId": "guardian"},
             "char_shu": {"subProfessionId": "guardian"}, "char_gummy": {"subProfessionId": "guardian"},
             "char_exu": {"subProfessionId": "fastshot"}, "char_kroos": {"subProfessionId": "fastshot"},
             "char_bp": {"subProfessionId": "fastshot"}}
    here = {c: e for c, e in chars.items() if c != "char_shu"}  # not on this server yet
    usage_ops = {"char_saria": {"score": 0.3}, "char_nearl": {"score": 0.1}, "char_shu": {"score": 0.4}, "char_gummy": {"score": 0.05},
                 "char_kroos": {"score": 0.2}, "char_bp": {"score": 0.1}}
    ops = [{"id": "char_saria", "share": 0.5}, {"id": "char_exu", "share": 0.4}, {"id": "char_shu", "share": 0.2}]
    alts = {"char_saria": {"flex": 0.0, "alts": []},
            "char_exu": {"flex": 0.6, "alts": [["char_kroos", 0.5], ["char_bp", 0.2]]},
            "char_shu": {"flex": 0.25, "alts": [["char_saria", 0.25]]}}
    upcoming.add_alternatives(ops, alts, chars, here, usage_ops)
    saria, exu, shu = ops
    assert saria == {"id": "char_saria", "share": 0.5, "like": ["char_nearl", "char_gummy"]}  # no Shu here, never itself
    assert exu == {"id": "char_exu", "share": 0.4, "alts": [["char_kroos", 0.5], ["char_bp", 0.2]], "flex": 0.6}  # enough from guides
    assert shu["alts"] == [["char_saria", 0.25]] and shu["like"] == ["char_nearl", "char_gummy"]  # Saria is listed once
