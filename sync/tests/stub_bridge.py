"""A stand-in Novena Sync for testing the website: the real bridge, with sample account data instead of a sign-in.

    python tests/stub_bridge.py        # prints the pairing code, serves 127.0.0.1:47615 until stopped
"""

import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from novena_sync import payload  # noqa: E402
from novena_sync.bridge import Bridge  # noqa: E402
from novena_sync.settings import Settings  # noqa: E402
from test_payload import RAW  # noqa: E402

settings = Settings()
path = Path(tempfile.mkdtemp()) / "settings.json"
bridge = Bridge(settings, lambda: settings.save(path), lambda server: payload.minimize(RAW, server), lambda: ["en"],
                on_event=lambda text: print(text, flush=True))
bridge.start()
print(f"CODE {bridge.code}", flush=True)
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    bridge.stop()
