# Roadmap

## Now: launch

- The new design across the site (navy, gold and ivory; the Novena emblem; the first-visit intro; card-to-page transitions).
- Credits page with every source, mirror, font and package license.
- Reddit launch post (`docs/reddit-post.md`).

## After launch, in order

1. **Event shop advisor.** Which event-shop offers are worth your tokens: Yituliu's record of CN event shops, matched to
   events, priced with our item values. Ported from ako.
2. **Training Room and Workshop picks.** The fastest trainer you own for each mastery, and who raises the Workshop's
   byproduct rate. Needs only your roster. Ported from ako.
3. **Progress with costs.** What changed between two roster snapshots, and the materials, LMD and EXP it took.
4. **Sanity timer.** Type your current sanity, see when it's full, with an optional browser notification.
5. **Base morale and dorms.** Morale-aware shifts and a dorm plan, using the game's default morale rules (no live data).
6. **Daily checklist.** The day's routine with ticks, kept in the browser.
7. **Items to use.** Training vouchers, potential tokens and expiring items, from the depot screenshot or typed in.
8. **Operator list from screenshots.** Waiting on sample screenshots.

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
- **Still to check with a real account:** whether a sync signs the player out of the game on their phone or PC (if it does, syncing
  mid-session must warn first), and how long a session token lasts.
