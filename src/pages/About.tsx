import { Await, useAsync } from "../components/ui";
import { manifest } from "../lib/data";
import { date } from "../lib/format";
import { href } from "../lib/router";
import { REPO_URL, SUPPORT } from "../config";

const SOURCES = [
  { name: "ArknightsAssets / ArknightsGamedata", url: "https://github.com/ArknightsAssets/ArknightsGamedata", key: "gamedata",
    what: "Game tables for all four servers: operators, skills, modules, items, stages, events.", license: "Game data © Hypergryph / Yostar" },
  { name: "Penguin Statistics", url: "https://penguin-stats.io/", key: "penguin",
    what: "Crowd-sourced drop rates per server, for the farming planner.", license: "CC BY-NC 4.0" },
  { name: "Yituliu (ark.yituliu.cn)", url: "https://ark.yituliu.cn/", key: "yituliu",
    what: "Material values in sanity, and how ~100k CN accounts build each operator.", license: "Used with credit; see their site" },
  { name: "MAA Copilot (prts.plus)", url: "https://prts.plus/", key: "copilot",
    what: "Community clear guides, read for usage statistics only (no guide is republished).", license: "Community-submitted; used for aggregates" },
  { name: "MAA (MaaAssistantArknights)", url: "https://github.com/MaaAssistantArknights/MaaAssistantArknights", key: "maa",
    what: "Integrated Strategies priorities and base skill values, used as data only.", license: "AGPL-3.0 (data files)" },
  { name: "Arknights Toolbox depot recognition", url: "https://github.com/arkntools/depot-recognition", key: "dr",
    what: "Reads depot screenshots on your device (item matching and digit reading).", license: "MIT (bundled; see notices)" },
  { name: "ArknightsGameResource", url: "https://github.com/yuanyan3060/ArknightsGameResource", key: "art",
    what: "Operator avatars, skill and item icons, loaded from this mirror (not bundled).", license: "Art © Hypergryph / Yostar" },
];

export default function About() {
  const m = useAsync(manifest, []);
  return (
    <div class="stack fade-in">
      <h1>About Doctor's Toolkit</h1>
      <section class="card">
        <p>Doctor's Toolkit is a free, open-source companion for Arknights: an operator database, side-by-side comparison, upgrade and farming planners, a recruitment calculator, community rankings and a look at what's coming from CN. It's a fan project, made by a player for players.</p>
        <p><strong>Not affiliated with Hypergryph, Yostar or Gryphline.</strong> Arknights and all game assets belong to their owners. The code is MIT-licensed: <a href={REPO_URL} rel="noopener">source on GitHub</a>.</p>
        <p><strong>No automation.</strong> This tool never drives the game client. It only reads public data and what you type in.</p>
      </section>
      <section class="card" id="privacy">
        <h2>Privacy</h2>
        <ul>
          <li>Everything you enter (roster, depot, plans, settings) is saved in your browser only. Nothing is sent to any server.</li>
          <li>No accounts, no analytics, no tracking, no cookies. The site never asks for a Yostar or game login.</li>
          <li>Depot screenshots you import are read on your device and never uploaded. Taking them is up to you: nothing here touches the game.</li>
          <li>The site loads its own data files and images from the art mirror on GitHub; those requests carry nothing about you beyond what any web request does.</li>
          <li>The optional command-line exporter runs on your own computer and writes a file you import here. It uses an unofficial login, which carries some account risk; manual entry is the recommended path.</li>
        </ul>
        <p><a href={href("/settings")}>Back up or delete your data</a></p>
      </section>
      <section class="card">
        <h2>Data sources and credits</h2>
        <p>A scheduled job fetches each source once a day and publishes static files; your browser never contacts these services directly. Thank you to everyone who runs and contributes to them.</p>
        <Await state={m} what="data dates">
          {(man) => (
            <div class="table-wrap">
              <table class="cards">
                <thead><tr><th>Source</th><th>Used for</th><th>License</th><th>Last updated</th></tr></thead>
                <tbody>
                  {SOURCES.map((s) => {
                    const t = s.key === "penguin" ? Math.max(0, ...Object.values(man.servers).map((x) => x?.penguin || 0)) : man.sources[s.key]?.date;
                    return (
                      <tr key={s.name}>
                        <td data-label="Source"><a href={s.url} rel="noopener">{s.name}</a></td>
                        <td data-label="Used for">{s.what}</td>
                        <td data-label="License">{s.license}</td>
                        <td data-label="Last updated">{t ? date(t) : s.key === "art" || s.key === "maa" ? "Live mirror" : s.key === "dr" ? "Library" : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Await>
        {m.data && <p class="muted" style={{ marginTop: "8px" }}>This site's data was built {date(m.data.built)}. {m.data.sources.copilot?.guides?.toLocaleString()} clear guides counted.</p>}
        <p class="muted">Both usage sources are CN, which runs ahead of the other servers: rankings hold, but percentages read lower than they will be once your server catches up. Estimates are labelled where they appear.</p>
      </section>
      <section class="card" id="support">
        <h2>Feedback and support</h2>
        <p>Open-source libraries the site bundles, with their licenses: <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>third-party notices</a>.</p>
        <p>Found a wrong number or have an idea? <a href={`${REPO_URL}/issues`} rel="noopener">Open an issue on GitHub</a>.</p>
        {SUPPORT.length > 0 && (
          <p>If the tool helps you, you can support its development: {SUPPORT.map((s, i) => <span key={s.url}>{i ? " · " : ""}<a href={s.url} rel="noopener">{s.label}</a></span>)}. Donations are optional and unlock nothing; hosting is free, so they go to development time.</p>
        )}
      </section>
    </div>
  );
}
