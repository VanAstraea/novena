import json
import urllib.error
import urllib.request

import pytest

from novena_sync import bridge as bridge_mod
from novena_sync.account import SignInNeeded
from novena_sync.bridge import Bridge
from novena_sync.settings import Settings

NOVENA = "https://novena-arknights.github.io"


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


@pytest.fixture
def setup(tmp_path):
    settings = Settings()
    calls = []

    def do_sync(server):
        calls.append(server)
        if server == "kr":
            raise SignInNeeded("Sign in to KR first.")
        return {"app": "novena-sync", "server": server, "n": len(calls)}

    clock = Clock()
    b = Bridge(settings, lambda: settings.save(tmp_path / "s.json"), do_sync, lambda: ["en"], clock=clock, port=0)
    b.start()
    yield b, calls, clock, settings
    b.stop()


def call(b, method, path, body=None, origin=NOVENA, key=None, host=None):
    req = urllib.request.Request(f"http://127.0.0.1:{b.port}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    if origin:
        req.add_header("Origin", origin)
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    if host:
        req.add_header("Host", host)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, dict(e.headers), json.loads(raw) if raw else {}


def pair(b):
    status, _, body = call(b, "POST", "/v1/pair", {"code": b.code})
    assert status == 200
    return body["key"]


def test_hello_says_who_it_is_but_nothing_more_without_a_key(setup):
    b, *_ = setup
    status, headers, body = call(b, "GET", "/v1/hello")
    assert status == 200 and body == {"app": "novena-sync", "version": bridge_mod.VERSION, "paired": False}
    assert headers["Access-Control-Allow-Origin"] == NOVENA


def test_other_websites_and_rebound_hosts_are_refused(setup):
    b, *_ = setup
    assert call(b, "GET", "/v1/hello", origin="https://evil.example")[0] == 403
    assert call(b, "GET", "/v1/hello", host="evil.example:47615")[0] == 403


def test_preflight_allows_the_local_network_request(setup):
    b, *_ = setup
    req = urllib.request.Request(f"http://127.0.0.1:{b.port}/v1/sync", method="OPTIONS")
    req.add_header("Origin", NOVENA)
    req.add_header("Access-Control-Request-Private-Network", "true")
    with urllib.request.urlopen(req, timeout=5) as r:
        assert r.status == 204
        assert r.headers["Access-Control-Allow-Private-Network"] == "true"
        assert "Authorization" in r.headers["Access-Control-Allow-Headers"]


def test_pairing_gives_a_key_that_is_stored_only_as_a_hash(setup):
    b, _, _, settings = setup
    old = b.code
    key = pair(b)
    assert b.code != old  # one code, one page
    assert len(settings.paired) == 1 and settings.paired[0].key_hash != key and settings.paired[0].label == NOVENA
    status, _, body = call(b, "GET", "/v1/hello", key=key)
    assert body["paired"] is True and body["signedIn"] == ["en"]


def test_wrong_codes_change_the_code_and_pause_pairing(setup):
    b, _, clock, _ = setup
    first = b.code
    wrong = "000000" if first != "000000" else "111111"
    for _ in range(bridge_mod.MAX_TRIES):
        assert call(b, "POST", "/v1/pair", {"code": wrong})[0] == 403
    assert b.code != first
    status, _, body = call(b, "POST", "/v1/pair", {"code": b.code})
    assert status == 403 and "Too many" in body["message"]
    clock.t += bridge_mod.LOCKOUT + 1
    assert call(b, "POST", "/v1/pair", {"code": b.code})[0] == 200


def test_sync_needs_a_key(setup):
    b, calls, *_ = setup
    assert call(b, "POST", "/v1/sync", {"server": "en"})[0] == 401
    assert call(b, "POST", "/v1/sync", {"server": "en"}, key="made-up")[0] == 401
    assert calls == []


def test_cooldown_returns_the_last_sync_instead_of_signing_in_again(setup):
    b, calls, clock, _ = setup
    key = pair(b)
    s1, _, b1 = call(b, "POST", "/v1/sync", {"server": "en"}, key=key)
    s2, _, b2 = call(b, "POST", "/v1/sync", {"server": "en"}, key=key)
    assert s1 == s2 == 200 and b1["fresh"] is True and b2["fresh"] is False
    assert b2["payload"] == b1["payload"] and 0 < b2["retryAfter"] <= bridge_mod.COOLDOWN
    assert calls == ["en"]
    clock.t += bridge_mod.COOLDOWN + 1
    assert call(b, "POST", "/v1/sync", {"server": "en"}, key=key)[2]["fresh"] is True
    assert calls == ["en", "en"]


def test_sign_in_needed_and_switched_off_and_bad_server(setup):
    b, _, _, settings = setup
    key = pair(b)
    status, _, body = call(b, "POST", "/v1/sync", {"server": "kr"}, key=key)
    assert status == 409 and body["error"] == "sign-in"
    assert call(b, "POST", "/v1/sync", {"server": "cn"}, key=key)[0] == 400
    settings.allow_browser = False
    assert call(b, "POST", "/v1/sync", {"server": "en"}, key=key)[0] == 403
