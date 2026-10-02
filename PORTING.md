# Porting notes: ako → Doctor's Toolkit

Doctor's Toolkit (DTK) grows out of **ako** (Arknights Account Optimizer, a private Python tool with a local
dashboard). This file says what moves over, what stays behind, and what changes because DTK is a public static site
for four servers that computes in the browser.

## Architecture

| Part | ako | DTK |
|---|---|---|
| Account data | ArkPRTS login + `account/syncData` snapshots on disk | Manual entry in the browser, or a JSON file from the optional local `dtk-export` CLI. Stored in IndexedDB (localStorage fallback). Never sent anywhere. |
| Community + game data | Downloaded on demand by each user's tool | Downloaded **once a day by GitHub Actions** (`pipeline/`), processed into compact static JSON under `/data/v1/`, and served from GitHub Pages. Browsers never call Penguin, Yituliu, MAA Copilot or the game-data mirrors. |
| Compute | Python (scipy HiGHS LP, plain Python) | TypeScript in the browser. The farming LP runs in `highs` (HiGHS compiled to WASM), loaded only by the Farming page. |
| UI | FastAPI + vanilla JS dashboard | Static SPA: Preact + TypeScript + Vite. Path URLs (`/compare?ops=...`) with a `404.html` copy of the shell so deep links work on Pages. |

**Two changes from the brief, and why:**

1. **Pages deploy uses the Pages artifact (`actions/deploy-pages`), not a `gh-pages` branch.** A daily pipeline that
   commits several MB of JSON to a branch grows the repo forever. The artifact deploy publishes the same files without
   any git history. Source caches (the incremental MAA Copilot download, which is the only expensive one) are kept
   between runs with `actions/cache`, so the daily run only asks Copilot for guides newer than the last one it saw.
2. **Preact over Svelte.** Same speed class, JSX that ports the ako dashboard's markup directly, and first-class
   TypeScript without a compiler plugin. Signals (`@preact/signals`) handle global state (server, theme, roster).

## Modules

### Ported to the pipeline (Python, `pipeline/dtk_pipeline/`)

| ako | DTK | Change |
|---|---|---|
| `gamedata.py` | `gamedata.py` | Same mirror (ArknightsAssets/ArknightsGamedata), all four locales. Adds tables ako never needed: `skill_table`, `battle_equip_table`, `range_table`, `handbook_team_table`, `handbook_info_table` (gender for the Male/Female recruitment tags), `char_meta_table` (alter forms). |
| `sources/penguin.py` | `sources/penguin.py` | All four regions (US, JP, KR, CN). Output trimmed to stages that drop something. |
| `sources/yituliu.py` | `sources/yituliu.py` | Unchanged parse; output is per-operator rates. |
| `sources/values.py` | `sources/values.py` | `server_corrections` runs once per server in the pipeline; the site ships the corrected values plus the list of corrections, so it can say why. |
| `sources/copilot.py` | `sources/copilot.py` | Same incremental fetch with the 0.5 s pause between pages. Only aggregates are published (usage per operator, per archetype, per stage); individual guides are not republished. |
| `efficiency.py` | `usage.py` | `compute_usage` and `build_target` unchanged. Adds lift (usage / ownership) and archetype usage (from `gaps.archetype_demand`). |
| `upcoming.py`, `cc.py`, `pulls.py` (banners only) | `upcoming.py` | Run per server against CN. Event readiness needs a roster, so the pipeline publishes each upcoming event's key operators (share of that event's guides); the browser checks them against the roster. |
| `roguelike.py` | `roguelike.py` | MAA's `recruitment.json` per theme, names resolved to char ids in the pipeline. Data only, credited. |
| `recruit.py` (`pool`) | `recruit.py` | The pool and tag list per server. Gender added from `handbook_info_table`, so Male/Female tags work (ako couldn't model them). |

### Ported to TypeScript (`src/lib/`)

| ako | DTK | Notes |
|---|---|---|
| `costs.py` | `lib/costs.ts` | Same model: Counter of item id → count, LMD = `4001`, EXP pseudo-item. Golden-tested against ako. |
| `crafting.py` | `lib/crafting.ts` | `Stock.pay` with the same one-craft-at-a-time rule; Dualchips from Factory formulas. Golden-tested. |
| `farming.py` | `lib/farming.ts` | Same LP (runs + crafts + unmet slack), solved by `highs` WASM. `schedule` ported as-is. |
| `recruit.py` (`combos`, `worth_picking`) | `lib/recruit.ts` | Golden-tested on the same tag sets. |
| `goals.py` (`parse`, `Target`) | `lib/build.ts` | The "Saria E2 L90, S2 M3, Mod X2" text format, unchanged regex. |
| `gaps.py` (`analyse`) | `lib/gaps.ts` | Archetype demand comes precomputed; coverage is computed against the browser roster. |
| `dump.py`, `planner.py` | `lib/planner.ts`, `lib/dump.ts` | v2. The guide-coverage planner needs the guides themselves, so the pipeline publishes a compact guidebook (char ids + requirements per slot, no text), loaded only by the Plan page. |
| `base.py`, `training.py` | `lib/base.ts` | v2. MAA `infrast.json` values as data, credited. Output is a readable list only. |
| `pulls.py` (savings, income) | `lib/pulls.ts` | v2. Savings typed in by hand (or from the export). |
| `roster.py` (`parse_sync_data`) | `cli/dtk_export.py` | Runs on the user's machine only; writes DTK's roster JSON. |
| `fetcher.py` | `cli/dtk_export.py` | ArkPRTS email-code login, on the user's own machine, with a clear account-risk warning. Token kept in `~/.dtk/` only if the user asks for it. |

### Dropped (never ported)

- **All automation and MAA execution:** `automation.py`, `maa_remote.py`, `maa_log.py`, `routines.py`, `todaylog.py`
  job tracking, `web/automation_api.py`, `static/routines.js`, and every MAA export (`views.base_maa`, `farm_maa`,
  `roguelike_maa`). Nothing drives the game client.
- `store.py`, `plancache.py`, `progress.py`'s snapshot diffing (snapshots live in the browser now), `web/app.py`
  (no server), packaging (no exe), `art.py`'s caching proxy (the browser loads images from the mirror directly).
- Account-only views that need live sync state: timers, today checklist, consumables, run sheet, base map from
  `roomSlots`.

## Multi-server changes

- Every published file is per server: `/data/v1/{en,jp,kr,cn}/…`. Server-independent community data (usage, Yituliu)
  lives in `/data/v1/common/`.
- Operator lists include every operator CN has. One the chosen server doesn't have yet keeps its CN name and text,
  marked "CN only" (the server filter can hide them).
- Game day: ako only knew Global (04:00 UTC-7). Reset times per server: EN 04:00 UTC-7, JP and KR 04:00 UTC+9,
  CN 04:00 UTC+8. The site shows them in the viewer's local time.
- Penguin regions: en → US, jp → JP, kr → KR, cn → CN. Side-story reruns appear as `<id>_perm`.
- CN→server lag is measured per server from shared event ids (ako measured Global only: about 157 days).
- Yituliu values come from CN drop rates; `server_corrections` is applied per server with that server's Penguin data.

## Browser compute notes

- The LP has a few hundred columns; HiGHS WASM solves it in tens of ms. `highs` is about 1 MB of WASM, fetched only
  when the Farming page solves.
- Costs, crafting and recruitment are plain TypeScript over the per-operator JSON. An operator's detail file holds
  everything its pages need (stats, skills at all levels, modules, base skills, costs), so Compare loads at most four
  small files.
- Golden tests: `scripts/make_golden.py` runs ako's own functions on fixed inputs and writes `tests/golden/*.json`;
  Vitest checks the TS ports return the same numbers.
