"""Checks on a built data folder (skipped when there is none): the files the site needs exist and look right."""

from __future__ import annotations

import json

import pytest

from novena_pipeline import OUT_DIR

pytestmark = pytest.mark.skipif(not (OUT_DIR / "manifest.json").exists(), reason="no built data (run the pipeline first)")


def load(path: str):
    return json.loads((OUT_DIR / path).read_text(encoding="utf-8"))


def built_servers():
    return list(load("manifest.json")["servers"])


def test_manifest_lists_sources():
    m = load("manifest.json")
    assert m["version"] == 1
    assert {"copilot", "yituliu", "gamedata"} <= set(m["sources"])


@pytest.mark.parametrize("server", ["en", "jp", "kr", "cn"])
def test_server_files(server):
    if server not in built_servers():
        pytest.skip(f"{server} not built")
    ops = load(f"{server}/operators.json")["ops"]
    assert len(ops) > 300
    saria = next(o for o in ops if o["id"] == "char_202_demkni")
    assert saria["rarity"] == 6 and saria["cls"] == "TANK"
    detail = load(f"{server}/ops/char_202_demkni.json")
    assert len(detail["phases"]) == 3 and len(detail["skills"]) == 3
    assert detail["phases"][2]["hi"]["hp"] > detail["phases"][2]["lo"]["hp"]
    assert all(len(s["levels"]) == 10 for s in detail["skills"])
    items = load(f"{server}/items.json")
    assert "30013" in items["items"] and items["values"]["30013"] > 0
    assert "3213" in items["recipes"]  # Dualchips come from the Factory
    stages = load(f"{server}/stages.json")
    assert len(stages["stages"]) > 50 and all(s["drops"] for s in stages["stages"])
    rec = load(f"{server}/recruit.json")
    assert len(rec["pool"]) > 100
    top = {t["id"] for t in rec["tags"]}
    assert {11, 14, 17, 28} <= top
