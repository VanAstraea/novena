"""HTTP with a cache on disk: each source is fetched at most once per MAX_AGE, and a failed refresh falls back to
the cached copy instead of failing the build."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dtk_pipeline import USER_AGENT

OFFLINE = os.environ.get("DTK_OFFLINE") == "1"  # local runs: use whatever is cached, however old


def get_bytes(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_json(url: str, timeout: int = 120) -> Any:
    return json.loads(get_bytes(url, timeout))


def cached_json(path: Path, url: str, max_age: float, *, refresh: bool = False) -> Any:
    """The JSON at `url`, via `path`. Re-downloaded when older than `max_age` seconds; never replaced by a
    truncated or invalid download."""
    stale = path.exists() and time.time() - path.stat().st_mtime > max_age and not OFFLINE
    if refresh or stale or not path.exists():
        try:
            data = get_bytes(url)
            json.loads(data)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            if not path.exists():
                raise
    return json.loads(path.read_text(encoding="utf-8"))
