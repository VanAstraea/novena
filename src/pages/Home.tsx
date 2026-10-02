import { searchOpen } from "../components/Search";
import { Art, Await, Explain, PortraitCard, useAsync } from "../components/ui";
import { Logo } from "../app";
import { art, operators, stages as loadStages, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, dayTime, duration, pct, relative } from "../lib/format";
import { href } from "../lib/router";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../lib/time";
import { hasRoster, SERVERS, server } from "../state";
import type { OpIndex } from "../types";

const TOOLS = [
  { path: "/operators", title: "Operators", text: "Stats, skills, modules, base skills and costs." },
  { path: "/compare", title: "Compare", text: "Two to four operators side by side." },
  { path: "/planner", title: "Planner", text: "Target builds in, materials and crafting out." },
  { path: "/farming", title: "Farming", text: "Cheapest stages, scheduled day by day." },
  { path: "/recruit", title: "Recruitment", text: "Every tag combination and what it guarantees." },
  { path: "/rankings", title: "Rankings", text: "Who community clears use, per content." },
  { path: "/upcoming", title: "Upcoming", text: "What's coming from CN, with dates." },
  { path: "/roster", title: hasRoster.value ? "My account" : "Add your roster", text: "Plans, gaps and a daily Sanity Dump." },
];

const idNum = (id: string) => parseInt(id.split("_")[1], 10) || 0;

function Today() {
  const s = server.value;
  const now = Date.now();
  const { weekday } = gameDay(s, now);
  const st = useAsync(() => Promise.all([loadStages(s), loadUpcoming(s)]), [s]);
  return (
    <section class="card" aria-labelledby="today-h" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h2 id="today-h" class="label" style={{ margin: 0 }}>Today on {SERVERS.find((x) => x.id === s)!.long}</h2>
      <div class="statgrid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div class="stat"><div class="k">Daily reset</div><div class="v">{duration(nextDailyReset(s, now) - now)}</div><div class="d">{dayTime(nextDailyReset(s, now))} your time</div></div>
        <div class="stat"><div class="k">Weekly reset</div><div class="v">{relative(nextWeeklyReset(s, now), now).replace("in ", "")}</div><div class="d">{dayTime(nextWeeklyReset(s, now))} your time</div></div>
      </div>
      <Await state={st} what="today's stages">
        {([stg, up]) => (
          <>
            <div>
              <div class="label">Supply and chip stages open</div>
              <div class="chips">{stg.zones.filter((z) => z.days.includes(weekday)).map((z) => <a key={z.id} class="chip" href={href("/farming")}>{z.prefix} · {z.name}</a>)}</div>
            </div>
            {up.running.length > 0 && (
              <div>
                <div class="label">Events running</div>
                {up.running.map((e) => <p key={e.id} style={{ margin: 0 }}><strong>{e.name}</strong> <span class="muted">ends {date(e.end)} ({relative(e.end)})</span></p>)}
              </div>
            )}
          </>
        )}
      </Await>
      <a class="btn primary" style={{ alignSelf: "flex-start", marginTop: "auto" }} href={href("/farming")}>Plan today's farming</a>
    </section>
  );
}

function Strip({ title, note, ops, sub }: { title: string; note: string; ops: OpIndex[]; sub: (o: OpIndex) => string }) {
  if (!ops.length) return null;
  return (
    <section style={{ marginTop: "22px" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2 class="label" style={{ margin: 0 }}>{title}</h2>
        <small class="muted">{note}</small>
      </div>
      <div class="strip" style={{ marginTop: "10px" }}>
        {ops.map((o) => <PortraitCard key={o.id} op={o} href={href(`/operator/${o.id}`)} sub={sub(o)} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage(), loadUpcoming(s)]), [s]);
  const newest = st.data?.[0].filter((o) => o.rarity === 6 && o.on.includes(s) && !o.patch).sort((a, b) => idNum(b.id) - idNum(a.id))[0];
  return (
    <div class="fade-in">
      <div class="home-hero">
        <section class="card intro">
          {newest && <Art srcs={art.splashes(newest.id, 2)} class="bg" alt="" eager />}
          <div class="row" style={{ gap: "14px" }}>
            <Logo size={54} />
            <h1>NOVENA</h1>
          </div>
          <p style={{ margin: 0, maxWidth: "46ch", color: "var(--muted)", fontSize: "1.05rem" }}>
            A free, open-source Arknights companion. No sign-up, no tracking: everything you enter stays in this browser.
          </p>
          <button class="searchbox" onClick={() => (searchOpen.value = true)} aria-label="Search: find an operator, item or stage">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 L 16 16" /></svg>
            Find an operator, item or stage <kbd>Ctrl K</kbd>
          </button>
          {newest && <a href={href(`/operator/${newest.id}`)} style={{ fontSize: "0.86rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Newest on {SERVERS.find((x) => x.id === s)!.label}: {newest.name} →</a>}
        </section>
        <Today />
      </div>

      <div class="tiles">
        {TOOLS.map((t) => <a key={t.path} class="entry" href={href(t.path)}><strong>{t.title}</strong><span>{t.text}</span></a>)}
      </div>

      <Await state={st} what="operators">
        {([ops, usage, up]) => {
          const byId = new Map(ops.map((o) => [o.id, o]));
          const top = ops.filter((o) => o.on.includes(s) && usage.ops[o.id]?.score && !o.patch)
            .sort((a, b) => (usage.ops[b.id].score || 0) - (usage.ops[a.id].score || 0)).slice(0, 8);
          const coming = up.operators.map((id) => byId.get(id)).filter((o): o is OpIndex => !!o).slice(0, 8);
          const eta = (o: OpIndex) => { const b = up.banners.find((x) => x.featured.includes(o.id)); return b ? `~${date(b.eta)}` : "Date not listed yet"; };
          return (
            <>
              <Strip title="Most used in community clears" note="Share of clear guides that use them" ops={top} sub={(o) => `Usage ${pct(usage.ops[o.id].score)}`} />
              <Strip title="Coming from CN" note="Estimated from CN's dates plus the measured lag" ops={coming} sub={eta} />
            </>
          );
        }}
      </Await>
      <Explain>Game days start at 04:00 server time; times are shown in your own time zone. Art and icons belong to Hypergryph / Yostar and load from community mirrors.</Explain>
    </div>
  );
}
