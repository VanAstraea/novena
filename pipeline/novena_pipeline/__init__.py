"""Novena data pipeline: downloads game tables and community data once, publishes compact static JSON.

Run by GitHub Actions on a schedule. Browsers only ever read what this writes, so community services see one
polite client a day instead of every visitor.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = Path(os.environ.get("NOVENA_CACHE", ROOT / ".cache"))
OUT_DIR = Path(os.environ.get("NOVENA_OUT", ROOT / "public" / "data" / "v1"))
USER_AGENT = "novena-pipeline (+https://github.com/VanAstraea/novena)"
SERVERS = ("en", "jp", "kr", "cn")
