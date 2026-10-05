"""Settings, kept in a small JSON file in the user's app-data folder. No secrets here: sessions live in the OS
credential store, and paired browsers are kept only as hashes of their keys."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Where Novena runs. The bridge answers only pages from these origins (the token is the real lock; this is a second).
NOVENA_ORIGINS = [
    "https://novena-arknights.github.io",
    "http://localhost:5174", "http://127.0.0.1:5174",  # local development
    "http://localhost:4173", "http://127.0.0.1:4173",  # local preview build
]


def config_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return base / "Novena Sync"


@dataclass
class Paired:
    key_hash: str  # sha256 of the key the browser holds
    label: str  # the site it paired from
    added: str


@dataclass
class Settings:
    server: str = "en"
    folder: str = str(Path.home() / "Documents" / "Novena Sync")
    save_file: bool = True  # also write the sync to a file for drag-and-drop
    allow_browser: bool = True  # let a paired Novena page ask for a sync while this app is open
    accepted: bool = False  # the player has read the notice about the unofficial sign-in
    origins: list[str] = field(default_factory=lambda: list(NOVENA_ORIGINS))
    paired: list[Paired] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path | None = None) -> "Settings":
        path = path or config_dir() / "settings.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()
        s = cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__ and k != "paired"})
        s.paired = [Paired(**p) for p in data.get("paired", [])]
        for origin in NOVENA_ORIGINS:  # new releases may add origins; keep the user's extras
            if origin not in s.origins:
                s.origins.append(origin)
        return s

    def save(self, path: Path | None = None) -> None:
        path = path or config_dir() / "settings.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=1), encoding="utf-8")
