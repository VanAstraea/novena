# Novena Sync

An optional desktop companion for [Novena](https://vanastraea.github.io/novena/). It signs in to your Arknights
account **on your own computer**, reads it, and hands Novena your operators, depot and currencies with one click. The
website never asks for a login and never sees one.

## Before you use it

- **Unofficial sign-in, at your own risk.** It uses [ArkPRTS](https://github.com/thesadru/arkprts), the community's
  unofficial game client, the same method other Arknights tools use. Yostar's terms don't allow third-party tools, so
  there is some risk to your account.
- **Every sync signs you out of the game elsewhere.** Arknights allows one session at a time, so signing in and each
  sync end the session on your phone or PC ("Verification expired"). Play, close the game, then sync; never sync
  mid-stage. Once or twice a day is plenty, and every sync is a sign-in Yostar can see.
- **Read-only.** It never changes anything in the game, never plays it, and has nothing to do with MAA or any other
  automation.
- **Your sign-in stays here.** Your email and the code Yostar emails you are never stored. The session they create is
  kept in your operating system's credential store (Windows Credential Manager, macOS Keychain) until you sign out.
- **Only what Novena uses leaves the game data.** Operators (level, promotion, potential, skills, masteries, modules,
  and the outfit each one wears), the depot, LMD, your Orundum, Originite Prime and permits, consumables (training
  vouchers, sanity potions: how many and when they expire), your recruitment slots (tags offered and picked, when
  they finish), your base (each room's type, level, team and their morale, what it makes and when it's done, the
  drones) and your sanity (amount, cap, when it was counted). Not your nickname, ids, friends, the base's visitors or
  clues, mail, purchases or history. See `novena_sync/payload.py` for the exact list.
- Entering your roster by hand on the website is the risk-free option.
- Servers: EN, JP and KR (Yostar accounts).

## Using it

1. Download the zip for your system from the [latest release](https://github.com/VanAstraea/novena/releases/latest),
   check it against the `SHA256SUMS` file next to it if you like, unzip it, and open **Novena Sync**.
   Windows may warn that the app is unrecognised (it isn't code-signed yet): choose *More info → Run anyway*.
   macOS: right-click the app, *Open*.
2. Read the notice, pick your server, enter your Yostar account email, then the code Yostar emails you. If you
   normally sign in to the game with Google, Apple, Facebook or as a guest, first bind an email in the game (User Center →
   *Bind Email*, the option that sends a code), and use only that email: with an email that isn't bound, the game
   creates a new, empty account for it instead of finding yours.
3. Sync, either way:
   - **From Novena:** My account → Import / export → Novena Sync → *Connect*, enter the six-digit code the app shows
     (once), then *Sync now* whenever you like while the app is open.
   - **By file:** *Sync now* in the app saves `novena-sync-<server>.json` (in `Documents/Novena Sync`); drag it onto
     Novena's import box.

The app and the website ask before each sync (you can turn that off). Syncs are spaced three minutes apart (a click
within that returns the last sync), and nothing runs in the background.

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
