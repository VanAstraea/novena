// Credits: who owns what Novena shows, where every image and number comes from, and every open-source package and
// font it ships, with their licenses (generated at build time by scripts/licenses.mjs).
import { Await, useAsync } from "../components/ui";
import { BASE, manifest } from "../lib/data";
import { date } from "../lib/format";
import { REPO_URL } from "../config";

interface Licenses {
  packages: { name: string; version: string; license: string; url: string; text: string }[];
  fonts: { name: string; by: string; license: string; url: string; text: string }[];
}

const IMAGES = [
  { name: "ArknightsGameResource", by: "yuanyan3060", url: "https://github.com/yuanyan3060/ArknightsGameResource",
    what: "Operator portraits, splash and outfit art (including the home page's Lemuen), skill, item and base-skill icons." },
  { name: "ArknightsAssets2", by: "ArknightsAssets", url: "https://github.com/ArknightsAssets/ArknightsAssets2",
    what: "The game's UI icons (classes, branches, elite, potential, mastery, rarity, module types and module art) and story backgrounds (the home page's cathedral hall)." },
];

const DATA = [
  { key: "gamedata", name: "ArknightsGamedata", by: "ArknightsAssets", url: "https://github.com/ArknightsAssets/ArknightsGamedata",
    what: "The game's own tables for all four servers: operators, skills, modules, items, stages, events, recruitment.", license: "Game data © Hypergryph and affiliates" },
  { key: "penguin", name: "Penguin Statistics", by: "Penguin Statistics", url: "https://penguin-stats.io/",
    what: "Crowd-sourced drop rates per server, for the farming planner and the Sanity Dump.", license: "CC BY-NC 4.0" },
  { key: "yituliu", name: "Yituliu", by: "ark.yituliu.cn", url: "https://ark.yituliu.cn/",
    what: "Material values in sanity, how about 100,000 surveyed CN accounts build each operator, and the record of every CN event shop (the event shop advisor).", license: "Used with credit" },
  { key: "copilot", name: "MAA Copilot guide database", by: "prts.plus", url: "https://prts.plus/",
    what: "Community-written clear guides: which operators, skills and modules each stage was cleared with. Read only to count usage, for Rankings and the Plan; no guide is republished.", license: "Community-submitted; used for aggregate statistics" },
  { key: "maa", name: "MAA resource files", by: "MaaAssistantArknights", url: "https://github.com/MaaAssistantArknights/MaaAssistantArknights",
    what: "Curated base-skill values and combinations, and the morale and dorm effects in their descriptions (the Base optimizer), and Integrated Strategies recruit priorities (the IS helper). Data only.", license: "AGPL-3.0" },
];

export default function Credits() {
  const m = useAsync(manifest, []);
  const lic = useAsync(() => fetch(`${BASE}licenses.json`).then((r) => r.json() as Promise<Licenses>), []);
  return (
    <div class="stack fade-in credits">
      <h1>Credits</h1>

      <section class="card">
        <h2>Game assets</h2>
        <p>Novena shows game resources (operator art, icons, item pictures, names and descriptions, and the game's own text and translations) so the tools look and read like the game. Copyright in these resources belongs to Shanghai Hypergryph Network Technology Co., Ltd. and its affiliates, including Yostar Limited, Yostar, Inc., Yostar (Hong Kong) Limited and Longcheng Network (龍成網路).</p>
        <p>Novena is an unofficial fan project, <strong>not affiliated with Hypergryph, Yostar or Gryphline</strong>. None of the game's art is stored in Novena's code: it loads from the community mirrors below.</p>
      </section>

      <section class="card">
        <h2>Images</h2>
        <p class="muted">Loaded live from these community mirrors by your browser.</p>
        <ul class="credit-list">
          {IMAGES.map((s) => <li key={s.name}><a href={s.url} rel="noopener"><strong>{s.name}</strong></a> <span class="muted">by {s.by}</span><br />{s.what}</li>)}
        </ul>
      </section>

      <section class="card">
        <h2>Data</h2>
        <p class="muted">A scheduled job fetches each source once a day and publishes static files with the site; your browser never contacts these services. Thank you to everyone who runs and contributes to them.</p>
        <Await state={m} what="data dates">
          {(man) => (
            <div class="table-wrap">
              <table class="cards">
                <thead><tr><th>Source</th><th>Used for</th><th>License</th><th>Last updated</th></tr></thead>
                <tbody>
                  {DATA.map((s) => {
                    const t = s.key === "penguin" ? Math.max(0, ...Object.values(man.servers).map((x) => x?.penguin || 0)) : man.sources[s.key]?.date;
                    return (
                      <tr key={s.key}>
                        <td data-label="Source"><a href={s.url} rel="noopener">{s.name}</a><br /><small>{s.by}</small></td>
                        <td data-label="Used for">{s.what}</td>
                        <td data-label="License">{s.license}</td>
                        <td data-label="Last updated">{t ? date(t) : "Live"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Await>
        <p class="muted" style={{ marginTop: "10px" }}>
          The MAA Copilot guide database is a library of written clear guides; Novena reads it for statistics only. Novena does not use the MAA automation program and never drives the game.
          The MAA resource files are AGPL-3.0: Novena's processed copies of them are published openly with the site (for example <a href={`${BASE}data/v1/en/base.json`}>base.json</a> and <a href={`${BASE}data/v1/en/is.json`}>is.json</a>), and the pipeline that makes them is in the <a href={REPO_URL} rel="noopener">source</a>.
          Penguin Statistics' data is used non-commercially, as its license asks.
        </p>
      </section>

      <section class="card">
        <h2>Fonts</h2>
        <Await state={lic} what="the license list">
          {(l) => (
            <ul class="credit-list">
              {l.fonts.map((f) => (
                <li key={f.name}>
                  <a href={f.url} rel="noopener"><strong>{f.name}</strong></a> <span class="muted">by {f.by} · {f.license}</span>
                  <details><summary>License text</summary><pre>{f.text}</pre></details>
                </li>
              ))}
            </ul>
          )}
        </Await>
      </section>

      <section class="card">
        <h2>Open-source software</h2>
        <Await state={lic} what="the license list">
          {(l) => (
            <>
              <p class="muted">Every package the site ships, generated when the site is built. Also as <a href={`${BASE}THIRD_PARTY_NOTICES.txt`}>plain text</a>.</p>
              <div class="pkg-list">
                {l.packages.map((p) => (
                  <details key={p.name + p.version}>
                    <summary><strong>{p.name}</strong> <span class="muted">{p.version}</span> <span class="badge">{p.license}</span></summary>
                    {p.url && <p><a href={p.url} rel="noopener">{p.url}</a></p>}
                    <pre>{p.text || `Licensed under ${p.license}.`}</pre>
                  </details>
                ))}
              </div>
            </>
          )}
        </Await>
      </section>

      <section class="card">
        <h2>Imports from other tools</h2>
        <p>Novena reads rosters kept on <a href="https://www.krooster.com" rel="noopener">Krooster</a> by neeia (<a href="https://github.com/neeia/ak-roster" rel="noopener">source</a>): you open your own public profile there and paste it here. Novena never contacts Krooster itself.</p>
      </section>

      <section class="card">
        <h2>Novena Sync (optional app)</h2>
        <p>The desktop companion signs in with <a href="https://github.com/thesadru/arkprts" rel="noopener">ArkPRTS</a> by thesadru (MIT), the community's unofficial Arknights client, and keeps its session with <a href="https://github.com/jaraco/keyring" rel="noopener">keyring</a> (MIT). Every package it bundles is listed with its license in the <code>NOTICES.txt</code> inside each download.</p>
              <p>What it keeps from the game data: operators (with the outfit each wears), the depot and currencies, consumables, recruitment slots, the base (rooms, teams, morale, production, drones) and sanity. Never names, ids, friends, visitors, mail or purchases.</p>
      </section>

      <section class="card">
        <h2>Novena</h2>
        <p>Code: MIT License, <a href={REPO_URL} rel="noopener">source on GitHub</a>. The Novena emblem and the site's design are original work for this project.</p>
      </section>
    </div>
  );
}
