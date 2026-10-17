"""Where each enemy appears: the stages whose level file lists it.

    {server}/enemy-stages.json   {"groups": [name, ...], "stages": [[code, name, group index], ...],
                                  "by": {enemy id: [[stage index, level variant], ...]}}
    {server}/stage-maps.json     {"maps": [map, ...]}, one per stage above, in the same order: rows top to bottom,
                                  joined by "/", one character per tile (see TILES)

Only the per-stage level files say which enemies a stage has (levels/obt/..., levels/activities/...: over 3,000 files,
some 300 MB per server), so each is read once and only its enemy list is kept, under the file's git blob hash: the
mirror's file tree gives every file's hash, and a file whose hash is already known isn't downloaded again. A daily
run fetches just the stages added or changed since the last one, and files the four servers share are read once.

Stages a player can visit and look up are listed: main story, events and their archives, side stories, supplies
and Annihilation. Story-only stages, challenge-mode copies (same level file), Integrated Strategies, Stationary
Security Service and the multiplayer and auto-chess modes are left out. An enemy is listed with the level variant the
stage uses (from the level file's enemy list; enemies other enemies summon are on it too).
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import time
import urllib.request
from typing import Any, Callable

from novena_pipeline import CACHE_DIR, USER_AGENT
from novena_pipeline import gamedata as gd
from novena_pipeline.net import OFFLINE, get_bytes

REPO = "ArknightsAssets/ArknightsGamedata"
TREE_URL = f"https://api.github.com/repos/{REPO}/git/trees/{{sha}}"
FILE_URL = f"https://raw.githubusercontent.com/{REPO}/master/{{locale}}/gamedata/levels/{{path}}"
CACHE = CACHE_DIR / "levels"
# A stage map's tiles, one character each: where operators deploy, where enemies walk, enter and leave.
TILES = {"start": "S", "flystart": "F", "end": "E", "hole": "o"}
SPECIAL = "*"  # healing, volcano, teleporter, and the other tiles with an effect of their own
PLAIN = {"tile_road", "tile_wall", "tile_floor", "tile_forbidden", "tile_grass", "tile_empty"}
TREE_MAX_AGE = 20 * 3600
KINDS = {"MAIN", "ACTIVITY", "SUB", "DAILY", "CAMPAIGN"}
SKIP_LEVELS = re.compile(r"autochess|multi|enemyduel", re.I)  # game modes with no stages to look up


def _api(url: str) -> Any:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    if os.environ.get("GITHUB_TOKEN"):  # in Actions: a higher rate limit (the run asks for 5 trees per server)
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
        return json.loads(r.read())


def level_hashes(server: str) -> dict[str, str]:
    """{path under levels/, lower case: blob hash} for the server, yesterday's list if the mirror can't be asked."""
    path = CACHE / f"tree-{server}.json"
    if path.exists() and (OFFLINE or time.time() - path.stat().st_mtime < TREE_MAX_AGE):
        return json.loads(path.read_text(encoding="utf-8"))
    try:
        sha = "master"
        for part in (server, "gamedata", "levels"):
            sha = next(e["sha"] for e in _api(TREE_URL.format(sha=sha))["tree"] if e["path"] == part)
        tree = _api(TREE_URL.format(sha=sha) + "?recursive=1")
        out = {e["path"].lower(): e["sha"] for e in tree["tree"] if e["type"] == "blob" and e["path"].endswith(".json")}
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out), encoding="utf-8")
        return out
    except Exception:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def map_of(level: dict) -> str:
    """The stage's grid, top row first ("/" between rows): g deployable ground, h deployable high ground, r ground
    enemies walk but nobody deploys on, x blocked, o hole, S enemy entry, F flying entry, E the defence point, * a tile
    with an effect of its own (healing, volcano, teleporter…). Empty when the file has no map."""
    m = level.get("mapData") or {}
    tiles = m.get("tiles") or []
    grid = m.get("map") or []
    if isinstance(grid, dict):  # some older files keep it flat: {"row_size", "column_size", "matrix_data"}, row by row
        n, flat = int(grid.get("column_size") or 0), grid.get("matrix_data") or []
        grid = [flat[i:i + n] for i in range(0, len(flat), n)] if n else []
    rows = []
    for row in grid:
        out = []
        for i in row:
            t = tiles[i] if 0 <= i < len(tiles) else {}
            key = (t.get("tileKey") or "").removeprefix("tile_")
            if key in TILES:
                out.append(TILES[key])
            elif t.get("tileKey") and t["tileKey"] not in PLAIN:
                out.append(SPECIAL)
            elif t.get("buildableType") in ("MELEE", "ALL") and t.get("heightType") == "LOWLAND":
                out.append("g")
            elif t.get("buildableType") in ("RANGED", "ALL"):
                out.append("h")
            elif t.get("heightType") == "LOWLAND" and t.get("passableMask") != "FLY_ONLY":
                out.append("r")
            else:
                out.append("x")
        rows.append("".join(out))
    return "/".join(rows)


def read_level(level: dict) -> dict:
    """What's kept of a level file: its enemies ("e") and its map ("m")."""
    return {"e": enemies_in(level), "m": map_of(level)}


def enemies_in(level: dict) -> list[list]:
    """[[enemy id, level variant], ...] a level file lists, in its order, each pair once."""
    seen, out = set(), []
    for ref in level.get("enemyDbRefs") or []:
        key = (ref.get("id"), int(ref.get("level") or 0))
        if key[0] and key not in seen:
            seen.add(key)
            out.append(list(key))
    return out


def _known() -> dict[str, dict]:
    """What's been read, by blob hash; entries from before maps were kept (a bare enemy list) are read again."""
    path = CACHE / "enemies.json"
    known = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {k: v for k, v in known.items() if isinstance(v, dict)}


def _save(known: dict[str, dict]) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "enemies.json").write_text(json.dumps(known, separators=(",", ":")), encoding="utf-8")


def fetch(server: str, paths: dict[str, str], log: Callable[[str], None] = print) -> dict[str, dict]:
    """{blob hash: {"e": enemies, "m": map}} for the given {path: hash}, downloading only hashes not read before."""
    known = _known()
    todo = {sha: p for p, sha in paths.items() if sha not in known}
    if todo and not OFFLINE:
        log(f"  [{server}] reading {len(todo)} new stage files")

        failed: list[str] = []

        def one(item: tuple[str, str]) -> tuple[str, dict | None]:
            sha, p = item
            try:
                return sha, read_level(json.loads(get_bytes(FILE_URL.format(locale=server, path=p), timeout=60)))
            except Exception as e:
                failed.append(f"{p} ({type(e).__name__}: {e})")
                return sha, None  # tried again tomorrow

        with concurrent.futures.ThreadPoolExecutor(8) as pool:
            for i, (sha, found) in enumerate(pool.map(one, todo.items()), 1):
                if found is not None:
                    known[sha] = found
                if i % 200 == 0:
                    _save(known)
        _save(known)
        if failed:  # unread stages drop out of the files until a later run reads them: say so, with an example
            log(f"  [{server}] {len(failed)} stage files couldn't be read, e.g. {failed[0]}")
    return known


def _group(st: dict, zones: dict, zone_act: dict, acts: dict) -> str:
    kind, zid = st["stageType"], st.get("zoneId") or ""
    z = zones.get(zid) or {}
    if kind == "CAMPAIGN":
        return "Annihilation"
    if kind == "DAILY":
        return f"Supplies: {z.get('zoneNameSecond') or zid}"
    if kind == "ACTIVITY" and zid in zone_act:
        name = (acts.get(zone_act[zid]) or {}).get("name") or zone_act[zid]
        return re.sub(r"\s*-\s*Rerun$", "", name.strip())
    return (z.get("zoneNameFirst") or z.get("zoneNameSecond") or zid).strip()


def build_from(stage_table: dict, zone_table: dict, activity_table: dict, hashes: dict[str, str],
               known: dict[str, dict], enemy_ids: set[str]) -> dict[str, Any]:
    """The enemy-stages file, with "maps" (one per stage, in order) for stage-maps.json; build() splits them off."""
    zones = zone_table.get("zones") or {}
    zone_act = activity_table.get("zoneToActivity") or {}
    acts = activity_table.get("basicInfo") or {}
    groups: list[str] = []
    stages: list[list] = []
    maps: list[str] = []
    by: dict[str, list[list[int]]] = {}
    done: set[str] = set()
    for st in (stage_table.get("stages") or {}).values():
        lid = (st.get("levelId") or "").lower()
        if (st.get("stageType") not in KINDS or st.get("isStoryOnly") or st.get("difficulty") == "FOUR_STAR"
                or not lid or lid in done or SKIP_LEVELS.search(lid)):
            continue
        level = known.get(hashes.get(f"{lid}.json", "")) or {}
        found = [(e, lv) for e, lv in level.get("e") or [] if e in enemy_ids]
        if not found:
            continue
        done.add(lid)
        g = _group(st, zones, zone_act, acts)
        if g not in groups:
            groups.append(g)
        stages.append([st.get("code") or st["stageId"], (st.get("name") or "").strip(), groups.index(g)])
        maps.append(level.get("m") or "")
        for e, lv in found:
            by.setdefault(e, []).append([len(stages) - 1, lv])
    return {"groups": groups, "stages": stages, "by": by, "maps": maps}


def build(server: str, enemy_ids: set[str], log: Callable[[str], None] = print) -> dict[str, Any]:
    stage_table = gd.table("stage_table", server)
    hashes = level_hashes(server)
    wanted = {}
    for st in (stage_table.get("stages") or {}).values():
        lid = (st.get("levelId") or "").lower()
        if st.get("stageType") in KINDS and not st.get("isStoryOnly") and lid and not SKIP_LEVELS.search(lid) and f"{lid}.json" in hashes:
            wanted[f"{lid}.json"] = hashes[f"{lid}.json"]
    known = fetch(server, wanted, log)
    return build_from(stage_table, gd.table("zone_table", server), gd.table("activity_table", server), hashes, known, enemy_ids)
