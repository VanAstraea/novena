"""Game tables for every server, from the ArknightsAssets/ArknightsGamedata mirror.

Kengxxiao/ArknightsGameData_YoStar, the usual Global source, was archived on 2025-11-13 and lacks every Global
release since, so all four locales come from ArknightsAssets (updated within days of each patch).
"""

from __future__ import annotations

from functools import cache
from typing import Any

from dtk_pipeline import CACHE_DIR
from dtk_pipeline.net import cached_json

BASE_URL = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/{locale}/gamedata/excel/{table}.json"
MAX_AGE = 20 * 3600  # the daily run refreshes everything
PATCH_PROFESSION = {"WARRIOR": "Guard", "MEDIC": "Medic", "CASTER": "Caster"}


@cache
def table(name: str, server: str) -> dict[str, Any]:
    return cached_json(CACHE_DIR / "gamedata" / server / f"{name}.json", BASE_URL.format(locale=server, table=name), MAX_AGE)


def chars(server: str) -> dict[str, dict]:
    """Every playable character on the server, alternate forms (Guard/Medic Amiya) included."""
    out = {cid: e for cid, e in table("character_table", server).items() if is_playable(cid, e)}
    for cid, e in table("char_patch_table", server)["patchChars"].items():
        out.setdefault(cid, e)
    return out


def is_playable(cid: str, e: dict) -> bool:
    return cid.startswith("char_") and e.get("profession") not in ("TOKEN", "TRAP") and not e.get("isNotObtainable")


def is_patch(cid: str, server: str) -> bool:
    return cid in table("char_patch_table", server)["patchChars"]


def rarity(e: dict) -> int:
    r = e.get("rarity")
    return int(str(r).removeprefix("TIER_")) if isinstance(r, str) else int(r) + 1


def phase(p: str | int) -> int:
    return int(str(p).removeprefix("PHASE_"))
