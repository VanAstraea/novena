import { searchOpen } from "../components/Search";
import { Await, Explain, useAsync } from "../components/ui";
import { stages as loadStages, upcoming as loadUpcoming } from "../lib/data";
import { date, dayTime, duration, relative } from "../lib/format";
import { href } from "../lib/router";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../lib/time";
import { hasRoster, SERVERS, server } from "../state";

const ENTRIES = [
  { path: "/operators", title: "Operators", text: "Every operator: stats, skills, modules, base skills, upgrade costs and how the community builds them." },
  { path: "/compare", title: "Compare", text: "Two to four operators side by side at the builds you choose, with the cost of getting there." },
  { path: "/planner", title: "Planner", text: "Pick target builds and get the total materials, LMD and EXP, and what to craft from lower tiers." },
];
const MORE = [
  { path: "/farming", title: "Farming planner", text: "The cheapest stages for what you're missing, scheduled day by day." },
  { path: "/recruit", title: "Recruitment", text: "Pick your five tags and see every guaranteed combination." },
  { path: "/rankings", title: "Rankings", text: "Who community clears use most, per content type and archetype." },
  { path: "/upcoming", title: "Upcoming", text: "Events, operators and banners coming from CN, with estimated dates." },
  { path: "/is", title: "Integrated Strategies", text: "The operators that carry each IS theme." },
  { path: "/roster", title: "My account", text: "Enter or import your roster for plans, gaps and a daily Sanity Dump." },
];

function Today() {
  const s = server.value;
  const now = Date.now();
  const { weekday } = gameDay(s, now);
  const st = useAsync(() => Promise.all([loadStages(s), loadUpcoming(s)]), [s]);
  return (
    <section class="card" aria-labelledby="today-h">
      <h2 id="today-h">Today on {SERVERS.find((x) => x.id === s)!.long}</h2>
      <dl class="kv">
        <dt>Daily reset</dt><dd>{dayTime(nextDailyReset(s, now))} your time (in {duration(nextDailyReset(s, now) - now)})</dd>
        <dt>Weekly reset</dt><dd>{dayTime(nextWeeklyReset(s, now))} your time ({relative(nextWeeklyReset(s, now), now)})</dd>
      </dl>
      <Await state={st} what="today's stages">
        {([stg, up]) => {
          const open = stg.zones.filter((z) => z.days.includes(weekday));
          return (
            <>
              <h3 style={{ marginTop: "12px" }}>Supply and chip stages open</h3>
              <p>{open.length ? open.map((z) => <span key={z.id} class="badge" style={{ marginRight: "6px" }}>{z.prefix} · {z.name}</span>) : "None"}</p>
              {up.running.length > 0 && (
                <>
                  <h3>Events running</h3>
                  <ul>{up.running.map((e) => <li key={e.id}>{e.name} <span class="muted">ends {date(e.end)} ({relative(e.end)})</span></li>)}</ul>
                </>
              )}
            </>
          );
        }}
      </Await>
      <Explain>Game days start at 04:00 server time; times here are in your own time zone.</Explain>
    </section>
  );
}

export default function Home() {
  return (
    <div class="stack fade-in">
      <section class="hero">
        <h1>Novena</h1>
        <p class="muted" style={{ maxWidth: "60ch", margin: 0 }}>A free, open-source Arknights companion. No sign-up, no tracking: everything you enter stays in this browser.</p>
        <button class="searchbox" onClick={() => (searchOpen.value = true)} aria-label="Search: find an operator, item or stage">
          <span aria-hidden="true">⌕</span> Find an operator, item or stage <kbd>Ctrl K</kbd>
        </button>
      </section>
      <div class="grid three">
        {ENTRIES.map((e) => <a key={e.path} class="entry" href={href(e.path)}><strong>{e.title}</strong><span>{e.text}</span></a>)}
      </div>
      <div class="grid two">
        <Today />
        <section class="card" aria-labelledby="more-h">
          <h2 id="more-h">More tools</h2>
          <div class="grid two">
            {MORE.map((e) => <a key={e.path} class="entry" href={href(e.path)}><strong>{e.title}</strong><span>{e.text}</span></a>)}
          </div>
          {!hasRoster.value && <p class="muted" style={{ marginTop: "10px" }}>Everything works without account data. Add your roster under My account for personal plans.</p>}
        </section>
      </div>
    </div>
  );
}
