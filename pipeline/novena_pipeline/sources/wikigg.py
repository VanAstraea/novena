"""Arknights Terra Wiki (arknights.wiki.gg, CC BY-SA 4.0): Global dates and English names for what CN has already run.

Its editors add a Global date once it's announced or found in the game files, before this server's own tables list it.
Read from the rendered articles only (robots.txt rules out the API and index.php), once a day:

    /wiki/Event                       "Ongoing/upcoming": events with their CN and Global dates
    /wiki/Event/Upcoming              CN events with no Global date yet (English names only)
    /wiki/Headhunting/Banners/Upcoming    CN banners with no Global date yet
    /wiki/Headhunting/Banners/<year>  banners with both dates, grouped by kind

CN dates are UTC+8 calendar days, Global dates UTC-7 days. The wiki is a bonus: unreachable or changed, it's skipped.
"""

from __future__ import annotations

import html
import re
import time
import urllib.error
import urllib.parse
from dataclasses import dataclass
from datetime import date, datetime, timezone
from functools import cache

from novena_pipeline import CACHE_DIR
from novena_pipeline.net import OFFLINE, get_bytes

BASE = "https://arknights.wiki.gg/wiki/"
MAX_AGE = 20 * 3600
KEEP = 7 * 86400  # an older copy is too stale to date anything
EVENTS, EVENTS_UPCOMING, BANNERS_UPCOMING = "Event", "Event/Upcoming", "Headhunting/Banners/Upcoming"

_RANGE = r"(\d{4})/(\d{1,2})/(\d{1,2})(?:\s*[–\-‐]\s*(\d{4})/(\d{1,2})/(\d{1,2}))?"
_ISO = r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))"


@dataclass
class Row:
    page: str  # the article it's on
    section: str  # the heading it's under
    tag: str  # "Side Story", "Limited Headhunting ‐ Crossover", "Rerun"...
    name: str
    url: str  # the event's own article, else the page's
    cn: tuple[date, date | None] | None
    glob: tuple[date, date | None] | None
    starts: str | None = None  # exact Global start (the countdown), when given


def url(title: str) -> str:
    return BASE + urllib.parse.quote(title.replace(" ", "_"), safe="/,:'()")


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def _range(m: re.Match | None) -> tuple[date, date | None] | None:
    if not m:
        return None
    start = date(int(m[1]), int(m[2]), int(m[3]))
    return start, date(int(m[4]), int(m[5]), int(m[6])) if m[4] else None


def parse(page: str, body: str) -> list[Row]:
    """Every dated row of the page's wiki tables. Headings and table rows are read in page order."""
    rows: list[Row] = []
    section = ""
    for m in re.finditer(r'<h[23][^>]*>(.*?)</h[23]>|<table[^>]*class="[^"]*mrfz-wtable[^"]*"[^>]*>(.*?)</table>', body, re.S):
        if m[1] is not None:
            section = re.sub(r"\s*\[\s*edit\s*\]$", "", _text(m[1]))
            continue
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", m[2], re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(cells) < 2:
                continue
            first = re.search(r"<b>(.*?)</b>", cells[0], re.S)
            label = _text(first[1] if first else cells[0])
            tag_m = re.match(r"\[([^\]]*)\]\s*(.*)", label)
            tag, name = (tag_m[1].strip(), tag_m[2].strip()) if tag_m else ("", label)
            link = re.search(r'<a href="/wiki/([^"#?]+)"', cells[0])
            text = _text(tr)
            cn = _range(re.search(r"CN(?: date)?:\s*" + _RANGE, text))
            glob = _range(re.search(r"Global(?: date)?:\s*" + _RANGE, text))
            if not cn and not glob:  # Event/Upcoming: the second column is the CN date, unlabelled
                cn = _range(re.match(_RANGE, _text(cells[1])))
            if not name or not cn:
                continue
            starts = re.search(r"starts in\s*" + _ISO, text)
            rows.append(Row(page, section, tag, name, url(urllib.parse.unquote(link[1])) if link else url(page),
                            cn, glob, starts[1] if starts else None))
    return rows


def valid(body: str) -> bool:
    """A real article (not an error or a filter's block page) with at least one of the wiki's tables."""
    return "mw-parser-output" in body and "mrfz-wtable" in body


class Fetcher:
    """Each page from the cache when it's fresh, else from the wiki; after one failed request the rest of the run
    uses the cache, so an unreachable wiki costs one timeout, not one per page."""

    def __init__(self) -> None:
        self.down: str | None = None
        self.newest = 0.0

    def page(self, title: str) -> str | None:
        path = CACHE_DIR / "sources" / f"wikigg_{re.sub(r'[^A-Za-z0-9]+', '_', title)}.html"
        age = time.time() - path.stat().st_mtime if path.exists() else float("inf")
        if age > MAX_AGE and not OFFLINE and not self.down:
            try:
                body = get_bytes(url(title), timeout=60, attempts=2).decode("utf-8")
                if not valid(body):
                    raise ValueError("not an article with the expected tables")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(body, encoding="utf-8", newline="\n")
                age = 0.0
                time.sleep(1)  # one page at a time, gently
            except urllib.error.HTTPError as e:
                if e.code != 404:  # a year page that doesn't exist yet is fine
                    self.down = f"{title}: HTTP {e.code}"
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
                self.down = f"{title}: {type(e).__name__}: {e}"
        if not path.exists() or (age > KEEP and not OFFLINE):
            return None
        self.newest = max(self.newest, path.stat().st_mtime)
        return path.read_text(encoding="utf-8")


@dataclass
class Wiki:
    events: list[Row]  # Event's ongoing/upcoming rows first, then Event/Upcoming's
    banners: list[Row]
    fetched: float  # newest page used (s), 0 when none


@cache
def load() -> Wiki:
    """The wiki's rows, once per run. Never raises: without the wiki, Upcoming keeps its estimates."""
    f = Fetcher()
    events: list[Row] = []
    banners: list[Row] = []
    try:
        if body := f.page(EVENTS):
            events += [r for r in parse(EVENTS, body) if r.section.lower().startswith("ongoing")]
        if body := f.page(EVENTS_UPCOMING):
            events += [r for r in parse(EVENTS_UPCOMING, body) if r.section != "Future"]
        if body := f.page(BANNERS_UPCOMING):
            banners += parse(BANNERS_UPCOMING, body)
        today = datetime.now(timezone.utc)
        for year in sorted({today.year, today.year + (today.month >= 9)}):
            if body := f.page(f"Headhunting/Banners/{year}"):
                banners += parse(f"Headhunting/Banners/{year}", body)
    except Exception as e:  # a changed page layout: carry on without it
        print(f"  wiki: couldn't read the pages ({type(e).__name__}: {e}); keeping estimates")
        return Wiki([], [], 0.0)
    if f.down:
        print(f"  wiki: not reachable ({f.down}); {'using the cached pages' if f.newest else 'keeping estimates'}")
    return Wiki(events, banners, f.newest)


def banner_kind(row: Row) -> str | None:
    """Novena's banner kind for a wiki row, from its tag or (on the yearly pages) its section."""
    where = f"{row.section} {row.tag}"
    if "Kernel" in where:
        return "kernel"
    if "Special" in where:
        return "special"
    if "Limited Headhunting" in where:
        return "collab" if "Crossover" in where else "limited"
    return None
