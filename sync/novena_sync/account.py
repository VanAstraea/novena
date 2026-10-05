"""Signing in and reading the account, through ArkPRTS (the community's unofficial game client).

The email and the one-time code are typed by the player and never stored. What's kept is the session the code buys
(the Yostar UID and token), in the operating system's credential store (Windows Credential Manager, macOS Keychain,
or the Secret Service on Linux), so later syncs need no new code. Nothing is ever written to the game: read only.
"""

from __future__ import annotations

import json
from typing import Any

import aiohttp
import arkprts
import keyring
from keyring.errors import KeyringError

KEYRING_SERVICE = "Novena Sync"


class SignInNeeded(RuntimeError):
    """There's no saved session for this server, or it has expired."""


class SyncError(RuntimeError):
    """A sign-in or sync step failed; the message says what happened in plain words."""


def _explain(step: str, exc: Exception, hint: str = "") -> SyncError:
    if isinstance(exc, arkprts.errors.GeetestError):  # a subclass of ArkPrtsError, so check it first
        why = "Yostar asked for a captcha check, which Novena Sync can't do. Wait a while and try again."
    elif isinstance(exc, (aiohttp.ClientError, TimeoutError, OSError)):
        why = f"couldn't reach the Yostar or game servers ({type(exc).__name__}). Check your connection."
    elif isinstance(exc, arkprts.errors.ArkPrtsError) and isinstance(getattr(exc, "data", None), dict):
        said = exc.data.get("msg") or exc.data.get("message") or exc.data.get("error") or ""
        why = f"the server refused it (code {exc.data.get('result', '?')}{f': {said}' if said else ''})."
    elif isinstance(exc, arkprts.errors.BaseArkprtsError):
        why = f"the server said {str(exc)[:300]}"
    else:
        why = f"{type(exc).__name__}: {str(exc)[:300]}"
    return SyncError(f"{step} failed: {why}" + (f" {hint}" if hint else ""))


class Vault:
    """Saved sessions, one per server. Falls back to memory (sign in each launch) if there's no credential store."""

    def __init__(self) -> None:
        self._memory: dict[str, dict[str, str]] = {}
        self.persistent = True

    def get(self, server: str) -> dict[str, str] | None:
        if server in self._memory:
            return self._memory[server]
        try:
            raw = keyring.get_password(KEYRING_SERVICE, server)
        except KeyringError:
            self.persistent = False
            return None
        return json.loads(raw) if raw else None

    def put(self, server: str, session: dict[str, str]) -> None:
        try:
            keyring.set_password(KEYRING_SERVICE, server, json.dumps(session))
        except KeyringError:
            self.persistent = False
            self._memory[server] = session

    def forget(self, server: str) -> None:
        self._memory.pop(server, None)
        try:
            keyring.delete_password(KEYRING_SERVICE, server)
        except KeyringError:
            pass


async def send_code(server: str, email: str) -> None:
    """Step 1: ask Yostar to email a one-time sign-in code."""
    if "@" not in email:
        raise SyncError("That doesn't look like an email address.")
    auth = arkprts.YostarAuth(server)
    try:
        await auth.send_email_code(email)
    except Exception as e:
        raise _explain("Sending the code", e) from e
    finally:
        await auth.network.close()


async def sign_in(vault: Vault, server: str, email: str, code: str) -> str:
    """Step 2: trade the code for a session, check it reaches the game server, and keep it. Returns the UID."""
    if not code.strip():
        raise SyncError("Enter the code from the email.")
    auth = arkprts.YostarAuth(server)
    try:
        channel_uid, token = await auth.get_token_from_email_code(email, code.strip())
        await auth.login_with_token(channel_uid, token)
    except Exception as e:
        raise _explain("Signing in", e, "Check the code, or send a new one.") from e
    finally:
        await auth.network.close()
    vault.put(server, {"channel_uid": channel_uid, "token": token})
    return channel_uid


async def read_account(vault: Vault, server: str) -> dict[str, Any]:
    """Read the whole account once (the game's own sync data). Raises SignInNeeded without a saved session."""
    session = vault.get(server)
    if not session:
        raise SignInNeeded(f"Sign in to {server.upper()} first.")
    client = None
    try:
        client = await arkprts.Client.from_token(session["channel_uid"], session["token"], server, assets=False)
        return await client.get_raw_data()
    except Exception as e:
        raise _explain("Syncing", e, "If your session has expired, sign out and sign in again.") from e
    finally:
        if client is not None:
            await client.network.close()
