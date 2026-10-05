# Novena Sync

An optional desktop companion for [Novena](https://novena-arknights.github.io/novena/). It signs in to your Arknights
account **on your own computer**, reads it, and hands Novena your operators, depot and currencies with one click. The
website never asks for a login and never sees one.

## Before you use it

- **Unofficial sign-in, at your own risk.** It uses [ArkPRTS](https://github.com/thesadru/arkprts), the community's
  unofficial game client, the same method other Arknights tools use. Yostar's terms don't allow third-party tools, so
  there is some risk to your account. Signing in may also sign you out of the game on your phone or PC.
- **Read-only.** It never changes anything in the game, never plays it, and has nothing to do with MAA or any other
  automation.
- **Your sign-in stays here.** Your email and the code Yostar emails you are never stored. The session they create is
  kept in your operating system's credential store (Windows Credential Manager, macOS Keychain) until you sign out.
- **Only what Novena uses leaves the game data.** Operators (level, promotion, potential, skills, masteries, modules),
  the depot, LMD and your Orundum, Originite Prime and permits. Not your nickname, friends, mail or history.
- Entering your roster by hand on the website is the risk-free option.
- Servers: EN, JP and KR (Yostar accounts).

## Using it

1. Download the zip for your system from the [latest release](https://github.com/novena-arknights/novena/releases/latest),
   check it against the `SHA256SUMS` file next to it if you like, unzip it, and open **Novena Sync**.
   Windows may warn that the app is unrecognised (it isn't code-signed yet): choose *More info → Run anyway*.
   macOS: right-click the app, *Open*.
2. Read the notice, pick your server, enter your Yostar account email, then the code Yostar emails you. Your game
   account needs an email linked to it (in the game's settings) if you normally sign in with Google, Apple or as a guest.
3. Sync, either way:
   - **From Novena:** My account → Import / export → Novena Sync → *Connect*, enter the six-digit code the app shows
     (once), then *Sync now* whenever you like while the app is open.
   - **By file:** *Sync now* in the app saves `novena-sync-<server>.json` (in `Documents/Novena Sync`); drag it onto
     Novena's import box.

Syncs are spaced three minutes apart (a click within that returns the last sync), and nothing runs in the background.

## How the browser link stays safe

The app listens only on `127.0.0.1:47615`, on your computer. A request must come from Novena's own address (other
websites are refused), name this computer as its host (which blocks DNS-rebinding tricks), and carry the key a page gets
by entering the six-digit code shown in the app. The app keeps only a hash of that key; *Forget all* in the app revokes
every paired page. Wrong codes are limited, then the code changes.

## Development

```bash
cd sync
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m novena_sync                 # the app
.venv/Scripts/python tests/stub_bridge.py           # a stand-in with sample data, to test the website's Sync button
```

Release builds come from GitHub Actions (`.github/workflows/sync-app.yml`, on a `sync-v*` tag). License: MIT.
Bundled third-party licenses are listed in `NOTICES.txt` inside each build.
