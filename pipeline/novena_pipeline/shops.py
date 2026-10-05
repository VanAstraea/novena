"""Event shops for the events running on a server or coming to it (after ako's shops.py).

Each Yituliu shop is matched to its CN event by the name activity_table gives it (a rerun's shop, "<event>复刻", stands
in when the original isn't recorded). Event ids are shared across servers, so an event running or coming here finds
its shop. The site prices each offer with its item values and marks what the player's plan is short of.

    {"events": [{"id", "name", "status": "running" | "upcoming", "start", "end" | "eta",
                 "offers": [[item id, price, quantity per purchase, stock or null, section], ...]}]}
"""

from __future__ import annotations

import re

from novena_pipeline import gamedata as gd
from novena_pipeline.sources import eventshop

_RERUN = re.compile(r"\s*[·\-]?\s*复刻\s*\d*$")


def base_name(name_cn: str) -> str:
    """'红丝绒·复刻' -> '红丝绒': the event a rerun's shop belongs to."""
    return _RERUN.sub("", name_cn).strip()


def by_activity(shops: list[eventshop.Shop], cn_events: dict[str, dict]) -> dict[str, eventshop.Shop]:
    """CN activity id -> its shop. The original event's own shop wins over a rerun's."""
    ids = {info.get("name"): act for act, info in cn_events.items() if not info.get("isReplicate")}
    out: dict[str, eventshop.Shop] = {}
    for shop in shops:
        act = ids.get(base_name(shop.name_cn))
        if act and shop.offers and (act not in out or base_name(out[act].name_cn) != out[act].name_cn):
            out[act] = shop
    return out


def build(server: str, upcoming: dict) -> dict:
    try:
        shops = by_activity(eventshop.load(), gd.table("activity_table", "cn")["basicInfo"])
    except Exception:  # Yituliu down and nothing cached: no shops today rather than no site
        return {"events": []}
    events = []
    for e in upcoming.get("running", []):
        if e["id"] in shops:
            events.append({"id": e["id"], "name": e["name"], "status": "running", "start": e["start"], "end": e["end"], "shop": shops[e["id"]]})
    for e in upcoming.get("events", []):
        if e["id"] in shops:
            events.append({"id": e["id"], "name": e.get("name") or e.get("name_cn"), "status": "upcoming", "eta": e.get("eta"),
                           "confirmed": e.get("confirmed", False), "shop": shops[e["id"]]})
    for e in events:
        e["offers"] = [[o.item_id, o.price, o.quantity, o.stock, o.area] for o in e.pop("shop").offers]
    return {"events": events}


def items(data: dict) -> set[str]:
    return {o[0] for e in data["events"] for o in e["offers"]}
