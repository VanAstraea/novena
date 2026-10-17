# Roadmap

## Launched

- The website, with the new design (navy, gold and ivory; the Novena emblem; the first-visit intro; card-to-page
  transitions), the Credits page with every source, mirror, font and package license, and the Reddit launch post
  (`docs/reddit-post.md`).
- Five sections (My account, Plan, Operators, Events, Tools), set out in the architecture plan: Today stays its own
  page, Sanity Dump stays its own page under Plan.

## Ported from ako (done)

Event shop advisor · Training Room and Workshop picks · progress with exact costs between snapshots · sanity timer
with notifications · morale and dorm plan (default numbers) · daily checklist · items to use (vouchers, potential
tokens, expiring items) · gaps by archetype · base map.

## Done since launch

- **From the Reddit feedback:** new operators at the top of the roster, auto E2/SL7, "Add all 4★", bulk edit; clue
  and drone reminders; farming drops per stage, craft steps and a Clear button; Upcoming's estimates labelled and the
  wiki's dates where it has them; Integrated Strategies, Reclamation Algorithm and Paradox Simulation in "What you
  play"; room levels and gold factory count on Base; story and event progress, from Novena Sync or marked by hand on
  Story & archives.
- **Importing:** Krooster profiles (pasted, a saved page or the API page) and depots (Krooster and Penguin Statistics
  planner exports); the Import guide.
- **Story & archives:** one-time Originite Prime and orundum, archive trials, free operators and where to get them,
  what's left for you, and which archive to unlock next.
- **Operators and planning:** module details everywhere, roles and replacements for guide operators, leave out
  operators in Priorities (one, a batch or a rarity), tier lists, account stats.
- **Enemy database:** every handbook enemy with abilities and stats at each level, where each appears (story, events,
  archives, supplies, Annihilation), and a stage search (1-7, CE-5) on the list and in the search box.
- **Install & offline** (a PWA), and backups that carry everything saved in the browser.
- **Upcoming:** Global dates from Oldwell (announcements and datamines, each with its source) where the wiki has none.
- **Base:** the Control Center's faction effects (Blacksteel and Pinus Sylvestris in factories, Siracusa and Kjerag
  in Trading Posts, Minos for the Reception Room, the Lungmen Guard pairing), counted in the plan; trainers that
  count Sami, Siracusa or Abyssal Hunter operators stationed in the base.

## Next

- **Operator list from screenshots.** Waiting on sample screenshots of the game's operator list.
- **More conditional base effects:** trainers counting "Knight", "Defending" or "Attacking" operators (the game
  doesn't list who those are), effects on Trading Post order limits, and conditional morale effects.
- **Check on a real account:** run Novena Sync with `NOVENA_SHAPE=1` once (it writes the keys, never the values) to
  confirm the recruit, base and progress field names, how paid Annihilation milestones show, and that
  `retro.block.open` means an archive is unlocked.
- **Waiting on a decision:** trimming font hinting (about 33 KB a visit).

## Novena Sync (optional companion): released

Code in `sync/`, release builds from `.github/workflows/sync-app.yml` on a `sync-v*` tag.
0.1.0 brought the roster, depot, base, recruitment and sanity; 0.2.0 (2026-10-13) adds optional story, event and
archive progress (off by default) and a note for players who sign in with Google, Apple, Facebook or as a guest.

- **What it does:** signs in to the player's own account on their own computer, reads it (read-only), and saves a sync
  file that Novena imports. The website itself never asks for a login and never sees credentials.
- **What it never does:** drive the game, automate anything, or talk to MAA. Read-only, by design.
- **Trust:** source on GitHub; builds made by GitHub Actions so anyone can check the app matches the code, with
  SHA-256 checksums. Not code-signed yet (Windows shows "unknown publisher").
- **Honest labelling:** unofficial, uses the game's unofficial login, at the player's own risk; Yostar's terms don't
  sanction third-party tools.

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
  site (Connect → Pair → Sync now, through Chrome's local-network prompt) works end to end. With the game closed
  during a sync, reopening it afterwards needed no new email code: nothing to redo.
- **Still to learn:** how long a session lasts before the app asks for a new code.
