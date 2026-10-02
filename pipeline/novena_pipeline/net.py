"""HTTP with a cache on disk: each source is fetched at most once per MAX_AGE, and a failed refresh falls back to
the cached copy instead of failing the build."""

from __future__ import annotations

import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from novena_pipeline import USER_AGENT

OFFLINE = os.environ.get("NOVENA_OFFLINE") == "1"  # local runs: use whatever is cached, however old


def get_bytes(url: str, timeout: int = 120, attempts: int = 3) -> bytes:
    """GET with a few retries and a growing pause: community services have the odd slow handshake."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == attempts - 1:
                raise
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def get_json(url: str, timeout: int = 120) -> Any:
    return json.loads(get_bytes(url, timeout))


def get_json_within(url: str, deadline: float) -> Any:
    """get_json, given up after `deadline` seconds however it's stuck (a DNS lookup ignores socket timeouts)."""
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(get_json, url, int(min(deadline, 120))).result(timeout=deadline)
    except concurrent.futures.TimeoutError as e:
        raise TimeoutError(f"no answer from {url.split('/')[2]} within {deadline:.0f} s") from e
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


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
