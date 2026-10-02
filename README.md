# Doctor's Toolkit

A free, open-source companion for **Arknights**: operator database, side-by-side comparison, upgrade and farming
planners, recruitment calculator, community rankings, and a look at what's coming from CN. For every server
(Global/EN, JP, KR, CN). **No sign-up, no tracking; your data stays in your browser.**

**Site:** https://&lt;your-github-user&gt;.github.io/doctors-toolkit/ · **Feedback:** [open an issue](../../issues)

<!-- Screenshots / GIFs: add docs/screenshots/*.png here before posting (see "Screenshots" below). -->

## What it does

Useful without any account data:

- **Operator database.** Every operator, searchable and filterable by class, branch, rarity, faction, how to get
  them and server. Each page has stats at any elite/level/potential/trust with module bonuses, every skill level and
  mastery with ranges drawn as grids, talents, modules stage by stage, base skills, every upgrade's materials and LMD,
  recruitment tags, alter forms, and community data: how often clear guides use the operator per content type, the
  build the community converges on, and *lift* (used more than its ownership rate suggests).
- **Compare** 2–4 operators side by side, each at its own build: stats, skills at the chosen mastery, talents and
  module effects, the cost of reaching each build (materials, LMD and a sanity-equivalent), and community usage.
  The best value in each row is marked. Every comparison is a shareable link.
- **Upgrade planner.** Type builds like `Saria E2 L90, S2 M3, Mod X2` (or pick them), get the total materials,
  LMD and EXP, what to craft from lower tiers, and what your depot already covers.
- **Farming planner.** The cheapest stage runs for what you're missing (a linear program over Penguin Statistics
  drop rates, solved in your browser), stages open today and this week, reset times in your local time, a
  day-by-day schedule, and a list of stages you can't auto-deploy yet to leave out.
- **Recruitment calculator.** Pick your five tags; see every combination with its guaranteed rarity and the
  operators it can give.
- **Rankings.** Usage in community clears per content type and archetype; your archetype gaps once you add a roster.
- **Upcoming content.** Events, operators, modules and banners CN has had and your server hasn't, with estimated
  dates from the measured CN→server lag, the operators each event's guides use most, and the next Contingency Contract.
- **Integrated Strategies.** Per theme, the operators that carry runs.

With your roster (typed in, or imported):

- **Roster tracker** with a quick bulk editor, depot, import/export (this site's files, raw syncData, Krooster
  exports) and progress over time.
- **Plan:** the upgrades that unlock the most community clears per sanity, your planner targets first, with a
  "doable now" check against your depot counted all together.
- **Sanity Dump:** what today's sanity should go into, aimed at the materials you hold least against what your plan
  and your strongest operators' community builds need.
- **Base (RIIC) optimizer:** best team per room over a 1–3 shift rotation, as a readable list.
- **Pull planner:** savings, steady income and the banners coming.

## Privacy

- Everything you enter is saved in your browser (IndexedDB) and nowhere else. Export and import a single JSON backup
  from Settings.
- No accounts, no analytics, no tracking, no cookies. The site never asks for a Yostar or game login.
- The site reads only its own static data files (built once a day) and images from a community art mirror.
- An **optional** command-line exporter ([`cli/`](cli/README.md)) logs in on *your own computer* and writes a roster
  file you import. It uses an unofficial login, which carries some account risk; manual entry is recommended.
- No automation of any kind: nothing here drives the game client.

## Data sources and credits

A GitHub Actions job fetches each source **once a day**, processes it and publishes static JSON; browsers never call
these services. Thank you to everyone who runs and contributes to them.

| Source | Used for | License / terms |
|---|---|---|
| [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) | Game tables for all servers | Game data © Hypergryph / Yostar |
| [Penguin Statistics](https://penguin-stats.io/) | Drop rates per server | [CC BY-NC 4.0](https://developer.penguin-stats.io/public-api/) |
| [Yituliu](https://ark.yituliu.cn/) | Material values; operator investment survey (~100k CN accounts) | Used with credit |
| [MAA Copilot](https://prts.plus/) | Clear guides, read for aggregate usage only (no guide is republished) | Community-submitted |
| [MAA](https://github.com/MaaAssistantArknights/MaaAssistantArknights) | IS priorities and base skill values, as data | AGPL-3.0 (data files) |
| [ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) | Operator, skill and item images (loaded, not bundled) | Art © Hypergryph / Yostar |

Both usage sources are CN, which runs months ahead: rankings hold, but percentages read lower than they will once
your server catches up. Derived numbers are labelled as estimates where they appear.

**Unofficial fan tool. Not affiliated with Hypergryph, Yostar or Gryphline. Arknights and all game assets belong to
their owners.** Code: [MIT](LICENSE).

## How it's built

- **Front end:** Preact + TypeScript + Vite, a static single-page app on GitHub Pages. Every view has a shareable URL.
- **Data pipeline:** Python (standard library only) in [`pipeline/`](pipeline), run daily by
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It writes versioned JSON under `/data/v1/`.
- **In-browser compute:** the farming LP runs in [HiGHS](https://highs.dev/) compiled to WebAssembly
  ([highs-js](https://github.com/lovasoa/highs-js)); costs, crafting, recruitment and the guide-coverage planner are
  TypeScript (the planner in a Web Worker).
- It grew out of a private tool, *ako*; [`PORTING.md`](PORTING.md) says what was ported and what was left out.

## Run it locally

Needs Node 20+ and Python 3.11+.

```bash
npm install
npm run data        # downloads game tables and community data into .cache/, builds public/data/v1 (a few minutes)
npm run dev         # http://localhost:5173
```

`npm run data -- --servers en` builds one server; `npm run data:offline` rebuilds from the cache without
downloading anything.

Tests:

```bash
npm test                              # unit + golden tests (TypeScript ports vs. the original Python)
cd pipeline && python -m pytest -q    # pipeline tests
npm run build && npm run smoke        # Playwright smoke test of the built site, phone and desktop
```

## Contributing

Issues and pull requests are welcome, especially wrong numbers (with the operator and server), translations of the UI,
and accessibility problems. Please keep the ground rules: no game automation, no server-side accounts or credentials,
user data stays in the browser, and community sources are fetched only by the daily pipeline.

## Screenshots

Take them from a local build or the live site and save them as `docs/screenshots/*.png`, then reference them at the
top of this file. Suggested: Home, an operator page, Compare with three operators, the Farming plan on a phone.
