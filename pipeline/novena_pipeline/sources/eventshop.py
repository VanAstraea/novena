"""Event shops: what each CN event's shop sold, from Yituliu's store history (after ako's sources/eventshop.py).

Event shops aren't in the client tables (the game sends them when a shop opens), so this is the community record: per
event (by its CN name), each item's shop section, price in event tokens, quantity per purchase and, where recorded, how
many can be bought. The other servers run the same events later with the same shops.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from novena_pipeline import CACHE_DIR
from novena_pipeline.net import cached_json

API = "https://backend.yituliu.cn/store/act/history"
MAX_AGE = 20 * 3600


@dataclass
class Offer:
    item_id: str
    price: int  # event tokens per purchase
    quantity: int  # items per purchase
    stock: int | None  # purchases allowed; None: not recorded
    area: int  # the shop's section, as Yituliu numbers them (1 = the top, limited goods)


@dataclass
class Shop:
    name_cn: str  # the event's CN name, as activity_table names it (reruns end in 复刻)
    offers: list[Offer] = field(default_factory=list)


def parse(rows: list[dict]) -> list[Shop]:
    shops = []
    for row in rows:
        offers = [Offer(str(i["itemId"]), int(i["itemPrice"]), int(i.get("itemQuantity") or 1),
                        int(i["itemStock"]) if i.get("itemStock") is not None else None, int(i.get("itemArea") or 0))
                  for i in row.get("actStore") or [] if i.get("itemPrice") and i.get("itemId")]
        shops.append(Shop(row.get("actName") or "", offers))
    return shops


def load() -> list[Shop]:
    payload = cached_json(CACHE_DIR / "sources" / "yituliu_event_shops.json", API, MAX_AGE)
    return parse(payload.get("data", []) if isinstance(payload, dict) else payload)  # ako cached the inner list
