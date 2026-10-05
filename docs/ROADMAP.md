# Roadmap

## Now: launch

- The new design across the site (navy, gold and ivory; the Novena emblem; the first-visit intro; card-to-page transitions).
- Credits page with every source, mirror, font and package license.
- Reddit launch post (`docs/reddit-post.md`).

## Ported from ako (done)

Event shop advisor · Training Room and Workshop picks · progress with exact costs between snapshots · sanity timer
with notifications · morale and dorm plan (default numbers) · daily checklist · items to use (vouchers, potential
tokens, expiring items).

## Next

- **Operator list from screenshots.** Waiting on sample screenshots.
- **Faction and conditional base effects** (ako had some: Control Center faction buffs, faction-counting trainers):
  they need to know who's stationed where, so they fit best once Novena Sync can bring the base layout.

## Novena Sync (optional companion): built, not yet released

Code in `sync/`, release builds from `.github/workflows/sync-app.yml` on a `sync-v*` tag. First release after the
website launches.

- **What it does:** signs in to the player's own account on their own computer, reads it (read-only), and saves a sync
  file that Novena imports. The website itself never asks for a login and never sees credentials.
- **What it never does:** drive the game, automate anything, or talk to MAA. Read-only, by design.
- **Trust:** source on GitHub; builds made by GitHub Actions so anyone can check the app matches the code; code-signed
  if we can.
- **Honest labelling:** unofficial, uses the game's unofficial login, at the player's own risk; Yostar's terms don't
  sanction third-party tools.
- **Quick, repeatable sync:** see below.
- Released after the website, once we've seen how the community reacts.

### Making syncs quick (as built)

The goal is one click from "I played" to "Novena is up to date", as often as the player likes, within limits that are
kind to the player's account and to Yostar's servers.

- **Sign in once.** The app keeps the session token on the player's machine (in the OS credential store), so later syncs
  need no email code until the token expires.
- **One click, from either side.** A "Sync now" button in the app. On the website, a "Sync from Novena Sync" button
  that asks the app on the same computer (over `127.0.0.1`, with a pairing code shown in the app, and the browser's
  local-network permission prompt) for a fresh sync and imports it straight away. Drag-and-drop of the saved file stays as the
  fallback that always works.
- **Limits.** A short cooldown between syncs (a few minutes) and no background polling: each sync is a deliberate click.
  Every sync is a sign-in to the game's servers, so frequent syncs are both more visible and less polite.
- **Checked with a real account (2026-10-05):** signing in and every sync sign the player out of the game on their
  other devices ("Verification expired": one session at a time). The app and the website now say so plainly and ask
  before each sync. The saved session works (a second sync needed no new code). Pairing and syncing from the live
  site (Connect → Pair → Sync now, through Chrome's local-network prompt) works end to end.
- **Still to learn:** how long a session lasts before the app asks for a new code.
