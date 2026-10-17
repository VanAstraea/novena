"""Oldwell (oldwell.info): Global's upcoming events, each with a date and where it came from (an official announcement
or a dataminer's post), the banner operators and the free ones. Credited on the Credits page.

    https://oldwell.info/assets/json/upcoming.json   {"last_updated": "dd.mm.yyyy", "list": [event, ...]}
    event: {"id", "name", "type", "date": {"date": "dd.mm.yyyy" or "", "reason", "source"},
            "banner": [{"type", "operators": [{"name", "img": "<char id>.png"}]}], "welfare": [{"img": ...}], ...}

Dates are Global calendar days (the server's own day, UTC-7). Read once a day; unreachable or changed, it's skipped.
"""

from __future__ import annotations

import json
import time
import urllib.error
from dataclasses import dataclass, field
from datetime import date

from novena_pipeline import CACHE_DIR
from novena_pipeline.net import OFFLINE, get_bytes

URL = "https://oldwell.info/assets/json/upcoming.json"
SITE = "https://oldwell.info/"
MAX_AGE = 20 * 3600
KEEP = 7 * 86400  # an older copy is too stale to date anything
CACHE = CACHE_DIR / "sources" / "oldwell_upcoming.json"


@dataclass
class Item:
    name: str
    kind: str  # Oldwell's type: "Side Story", "Limited Rerun", "Contingency Contract"…
    day: date | None  # the Global start day, when Oldwell has one
    reason: str  # "Official Announcement", "<someone> Datamine"…
    source: str  # where the date comes from (a post), or ""
    banner: list[str] = field(default_factory=list)  # featured operators' char ids
    welfare: list[str] = field(default_factory=list)

    @property
    def rerun(self) -> bool:
        return "rerun" in f"{self.kind} {self.name}".lower()


def _day(s: str) -> date | None:
    try:
        d, m, y = (int(x) for x in (s or "").split("."))
        return date(y, m, d)
    except ValueError:
        return None


def _char(img: str | None) -> str | None:
    cid = (img or "").rsplit("/", 1)[-1].removesuffix(".png")
    return cid if cid.startswith("char_") else None


def parse(data: dict) -> list[Item]:
    out = []
    for e in (data or {}).get("list") or []:
        d = e.get("date") or {}
        out.append(Item(
            name=(e.get("name") or "").strip(), kind=(e.get("type") or "").strip(), day=_day(d.get("date") or ""),
            reason=(d.get("reason") or "").strip(), source=(d.get("source") or "").strip(),
            banner=[c for b in e.get("banner") or [] for o in b.get("operators") or [] if (c := _char(o.get("img")))],
            welfare=[c for w in e.get("welfare") or [] if (c := _char(w.get("img")))],
        ))
    return out


def load() -> list[Item]:
    """Oldwell's list, fetched at most once per MAX_AGE; yesterday's copy if it can't be reached, nothing if that's
    older than a week."""
    fresh = CACHE.exists() and (OFFLINE or time.time() - CACHE.stat().st_mtime < MAX_AGE)
    if not fresh and not OFFLINE:
        try:
            raw = get_bytes(URL, timeout=60)
            data = json.loads(raw)
            if isinstance(data, dict) and isinstance(data.get("list"), list):
                CACHE.parent.mkdir(parents=True, exist_ok=True)
                CACHE.write_bytes(raw)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            pass
    if not CACHE.exists() or (not OFFLINE and time.time() - CACHE.stat().st_mtime > KEEP):
        return []
    try:
        return parse(json.loads(CACHE.read_text(encoding="utf-8")))
    except ValueError:
        return []
