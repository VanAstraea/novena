import { useAsync } from "../components/ui";
import { manifest } from "../lib/data";
import { date } from "../lib/format";
import { href } from "../lib/router";
import { REPO_URL, SUPPORT } from "../config";

export default function About() {
  const m = useAsync(manifest, []);
  return (
    <div class="stack fade-in">
      <h1>About Novena</h1>
      <section class="card">
        <p>Novena is a free, open-source companion for Arknights: an operator database, side-by-side comparison, upgrade and farming planners, a recruitment calculator, community rankings and a look at what's coming from CN. It's a fan project, made by a player for players.</p>
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
        </ul>
        <p><a href={href("/settings")}>Back up or delete your data</a></p>
      </section>
      <section class="card">
        <h2>Where everything comes from</h2>
        <p>Game tables, drop rates, material values and community statistics are fetched once a day by a scheduled job; operator art and icons load from community mirrors. Every source, image mirror, font and open-source package is listed with its license on the <a href={href("/credits")}>Credits</a> page.</p>
        {m.data && <p class="muted">This site's data was built {date(m.data.built)}. {m.data.sources.copilot?.guides?.toLocaleString()} community clear guides counted.</p>}
        <p class="muted">Usage statistics come from CN, which runs ahead of the other servers: rankings hold, but percentages read lower than they will be once your server catches up. Estimates are labelled where they appear.</p>
      </section>
      <section class="card" id="support">
        <h2>Feedback and support</h2>
        <p>Found a wrong number or have an idea? <a href={`${REPO_URL}/issues`} rel="noopener">Open an issue on GitHub</a>.</p>
        {SUPPORT.length > 0 && (
          <p>If the tool helps you, you can support its development: {SUPPORT.map((s, i) => <span key={s.url}>{i ? " · " : ""}<a href={s.url} rel="noopener">{s.label}</a></span>)}. Donations are optional and unlock nothing; hosting is free, so they go to development time.</p>
        )}
      </section>
    </div>
  );
}
