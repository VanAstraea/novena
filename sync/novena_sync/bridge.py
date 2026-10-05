"""The bridge: a tiny web server on 127.0.0.1 so a Novena page can ask this app for a fresh sync with one click.

It only ever listens on this computer, and every request is checked four ways:
  - Host must be 127.0.0.1 or localhost on our port (stops DNS-rebinding tricks from other sites),
  - a browser's Origin must be one of Novena's (other websites are refused),
  - syncs need a key the page got by pairing: typing the six-digit code this app shows (kept here only as a hash),
  - syncs are rate-limited: within the cooldown the last sync is returned instead of signing in to the game again.
Each sync is a deliberate click; nothing polls in the background.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import secrets
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

from . import SERVERS, VERSION
from .account import SignInNeeded, SyncError
from .settings import Paired, Settings

PORT = 47615
COOLDOWN = 180  # seconds between real syncs per server
MAX_TRIES = 5  # wrong pairing codes before the code changes and pairing pauses
LOCKOUT = 30


def key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class Bridge:
    def __init__(self, settings: Settings, save_settings: Callable[[], None], do_sync: Callable[[str], dict[str, Any]],
                 signed_in: Callable[[], list[str]], on_event: Callable[[str], None] = lambda _: None,
                 clock: Callable[[], float] = time.monotonic, port: int = PORT) -> None:
        self.settings, self.save_settings, self.do_sync, self.signed_in, self.on_event = settings, save_settings, do_sync, signed_in, on_event
        self.clock, self.port = clock, port
        self.code = self._new_code()
        self.tries, self.locked_until = 0, 0.0
        self.cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._sync_lock = threading.Lock()
        self._server: ThreadingHTTPServer | None = None

    @staticmethod
    def _new_code() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    # --- the rules -------------------------------------------------------------------------------------------------
    def host_ok(self, host: str | None) -> bool:
        return host in (f"127.0.0.1:{self.port}", f"localhost:{self.port}")

    def origin_ok(self, origin: str | None) -> bool:
        return origin is None or origin in self.settings.origins  # no Origin: not a web page (curl, scripts)

    def key_ok(self, auth: str | None) -> bool:
        if not auth or not auth.startswith("Bearer "):
            return False
        h = key_hash(auth[7:].strip())
        return any(hmac.compare_digest(h, p.key_hash) for p in self.settings.paired)

    def pair(self, code: str, label: str) -> str:
        """Trade the code on screen for a long-lived key. Wrong guesses are limited, then the code changes."""
        now = self.clock()
        if now < self.locked_until:
            raise PermissionError("Too many wrong codes. Wait a moment, then use the new code shown in Novena Sync.")
        if not hmac.compare_digest(str(code).strip(), self.code):
            self.tries += 1
            if self.tries >= MAX_TRIES:
                self.code, self.tries, self.locked_until = self._new_code(), 0, now + LOCKOUT
            raise PermissionError("That code doesn't match the one shown in Novena Sync.")
        key = secrets.token_urlsafe(32)
        self.settings.paired.append(Paired(key_hash(key), label[:80], datetime.now(timezone.utc).date().isoformat()))
        self.save_settings()
        self.code, self.tries = self._new_code(), 0  # one code, one browser
        self.on_event(f"Paired with Novena ({label}).")
        return key

    def sync(self, server: str) -> tuple[dict[str, Any], bool, int]:
        """Returns (payload, fresh, seconds until a fresh sync is allowed)."""
        with self._sync_lock:  # one sync at a time
            now = self.clock()
            last = self.cache.get(server)
            if last and now - last[0] < COOLDOWN:
                return last[1], False, max(1, math.ceil(COOLDOWN - (now - last[0])))
            payload = self.do_sync(server)
            self.cache[server] = (self.clock(), payload)
            self.on_event("Synced for Novena in your browser.")
            return payload, True, COOLDOWN

    def remember(self, server: str, payload: dict[str, Any]) -> None:
        """A sync made from the app's own button counts toward the cooldown too."""
        self.cache[server] = (self.clock(), payload)

    # --- the server ------------------------------------------------------------------------------------------------
    def start(self) -> None:
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            server_version = f"NovenaSync/{VERSION}"

            def log_message(self, *args: Any) -> None:  # quiet
                pass

            def _send(self, status: int, body: dict[str, Any] | None = None) -> None:
                data = json.dumps(body or {}).encode()
                self.send_response(status)
                origin = self.headers.get("Origin")
                if origin and bridge.origin_ok(origin):
                    self.send_header("Access-Control-Allow-Origin", origin)
                    self.send_header("Vary", "Origin")
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _guard(self) -> bool:
                if not bridge.host_ok(self.headers.get("Host")) or not bridge.origin_ok(self.headers.get("Origin")):
                    self._send(403, {"error": "forbidden"})
                    return False
                return True

            def _body(self) -> dict[str, Any]:
                n = min(int(self.headers.get("Content-Length") or 0), 4096)
                try:
                    return json.loads(self.rfile.read(n) or b"{}")
                except ValueError:
                    return {}

            def do_OPTIONS(self) -> None:
                if not bridge.host_ok(self.headers.get("Host")) or not bridge.origin_ok(self.headers.get("Origin")):
                    self.send_response(403)
                    self.end_headers()
                    return
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "")
                self.send_header("Access-Control-Allow-Methods", "GET, POST")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
                self.send_header("Access-Control-Allow-Private-Network", "true")  # Chrome's local-network check
                self.send_header("Access-Control-Max-Age", "600")
                self.send_header("Vary", "Origin")
                self.end_headers()

            def do_GET(self) -> None:
                if not self._guard():
                    return
                if self.path != "/v1/hello":
                    return self._send(404, {"error": "not-found"})
                body: dict[str, Any] = {"app": "novena-sync", "version": VERSION}
                if bridge.key_ok(self.headers.get("Authorization")):
                    body.update(paired=True, allow=bridge.settings.allow_browser, signedIn=bridge.signed_in())
                else:
                    body["paired"] = False
                self._send(200, body)

            def do_POST(self) -> None:
                b = self._body()  # read it first: answering with the body unread resets the connection on Windows
                if not self._guard():
                    return
                if self.path == "/v1/pair":
                    try:
                        key = bridge.pair(str(b.get("code", "")), self.headers.get("Origin") or "a local page")
                    except PermissionError as e:
                        return self._send(403, {"error": "bad-code", "message": str(e)})
                    return self._send(200, {"key": key})
                if self.path == "/v1/sync":
                    if not bridge.key_ok(self.headers.get("Authorization")):
                        return self._send(401, {"error": "not-paired", "message": "Pair this page with Novena Sync first."})
                    if not bridge.settings.allow_browser:
                        return self._send(403, {"error": "off", "message": "Browser syncs are switched off in Novena Sync."})
                    server = str(b.get("server", ""))
                    if server not in SERVERS:
                        return self._send(400, {"error": "server", "message": "Novena Sync supports EN, JP and KR."})
                    try:
                        payload, fresh, wait = bridge.sync(server)
                    except SignInNeeded as e:
                        return self._send(409, {"error": "sign-in", "message": f"{e} Open Novena Sync and sign in."})
                    except SyncError as e:
                        return self._send(502, {"error": "sync-failed", "message": str(e)})
                    return self._send(200, {"payload": payload, "fresh": fresh, "retryAfter": wait})
                self._send(404, {"error": "not-found"})

        self._server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        self.port = self._server.server_address[1]  # port 0 (tests) picks a free one
        threading.Thread(target=self._server.serve_forever, name="bridge", daemon=True).start()

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
