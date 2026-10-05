import { useEffect, useRef, useState } from "preact/hooks";
import { searchOpen } from "../components/Search";
import { Await, Explain, PortraitCard, useAsync } from "../components/ui";
import { art, BASE, operators, stages as loadStages, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, dayTime, duration, pct, relative } from "../lib/format";
import { href, route } from "../lib/router";
import { pref, setPref } from "../lib/storage";
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

// The hero: Lemuen in her alternate outfit, set like an altarpiece in Laterano's cathedral hall at night.
const HERO_ART = art.skin("char_4193_lemuen_ambienceSynesthesia#7b");
const HERO_SCENE = art.scene("26_g2_laterano_cathedralhall");
const HALO = [0.491, 0.22]; // the halo above her head, as a share of the art's width and height
const WORD = "NOVENA";
const INTRO_KEY = "introSeen";

function shouldPlayIntro(): boolean {
  const q = route.value.query.get("intro");
  if (q === "1") return true;
  if (q === "0" || navigator.webdriver) return false;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || innerWidth < 900 || innerHeight < 560) return false;
  return pref(INTRO_KEY, "") !== "1";
}

function HeroToday() {
  const s = server.value;
  const now = Date.now();
  const { weekday } = gameDay(s, now);
  const st = useAsync(() => Promise.all([loadStages(s), loadUpcoming(s)]), [s]);
  return (
    <aside class="hero-today" aria-labelledby="today-h" data-in style={{ "--d": 6 }}>
      <h2 id="today-h">Today on {SERVERS.find((x) => x.id === s)!.long}</h2>
      <div class="statgrid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div class="stat"><div class="k">Daily reset</div><div class="v">{duration(nextDailyReset(s, now) - now)}</div><div class="d">{dayTime(nextDailyReset(s, now))}</div></div>
        <div class="stat"><div class="k">Weekly reset</div><div class="v">{relative(nextWeeklyReset(s, now), now).replace("in ", "")}</div><div class="d">{dayTime(nextWeeklyReset(s, now))}</div></div>
      </div>
      <Await state={st} what="today's stages">
        {([stg, up]) => (
          <>
            <p><span class="muted">Open today:</span> {stg.zones.filter((z) => z.days.includes(weekday)).map((z) => z.prefix).join(" · ") || "none"}</p>
            {up.running.slice(0, 2).map((e) => <p key={e.id}><strong>{e.name}</strong> <span class="muted">ends {date(e.end)}</span></p>)}
          </>
        )}
      </Await>
      <a class="go" href={href("/farming")}>Plan today's farming →</a>
    </aside>
  );
}

function Hero({ stage, altarRef }: { stage: "idle" | "reveal"; altarRef: { current: HTMLDivElement | null } }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section class={`hero${stage === "reveal" ? " reveal" : ""}`} aria-labelledby="hero-h">
      <img class="hero-bg" src={HERO_SCENE} alt="" />
      <div class="hero-tint" />
      <div class="hero-shafts" aria-hidden="true"><i /><i /><i /></div>
      <div class="hero-altar" ref={altarRef}>
        <div class="altar-glow" />
        <div class="altar-rays"><div class="rays" /></div>
        <svg class="altar-ring" viewBox="-100 -20 200 40" aria-hidden="true">
          <ellipse pathLength="1" cx="0" cy="0" rx="100" ry="16" />
          <ellipse pathLength="1" cx="0" cy="0" rx="118" ry="19" />
        </svg>
        <img class={`hero-art${loaded ? " loaded" : ""}`} src={HERO_ART} alt="Lemuen in her alternate outfit, seated before a golden pipe organ"
          onLoad={() => setLoaded(true)} />
      </div>
      <div class="hero-copy">
        <img class="crest" src={`${BASE}novena-crest.svg`} alt="" width={112} height={112} />
        <p class="eyebrow" data-in style={{ "--d": 0 }}>An Arknights companion</p>
        <h1 id="hero-h" class="wordmark" aria-label="Novena">
          {[...WORD].map((c, i) => <span key={i} aria-hidden="true" style={{ "--i": i }}>{c}</span>)}
        </h1>
        <p class="tag" lang="la" data-in style={{ "--d": 1 }}>Ora et labora</p>
        <p class="lede" data-in style={{ "--d": 2 }}>Plan upgrades, compare operators and farm smarter. No sign-up, no tracking: everything you enter stays in this browser.</p>
        <button class="searchbox" data-in style={{ "--d": 3 }} onClick={() => (searchOpen.value = true)} aria-label="Search: find an operator, item or stage">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 L 16 16" /></svg>
          <span>Find an operator, item or stage</span><kbd>Ctrl K</kbd>
        </button>
        <nav class="quick" aria-label="Popular tools" data-in style={{ "--d": 4 }}>
          <a href={href("/planner")}>Planner</a><a href={href("/farming")}>Farming</a><a href={href("/recruit")}>Recruit</a><a href={href("/rankings")}>Rankings</a>
        </nav>
      </div>
      <HeroToday />
      <p class="hero-credit" data-in style={{ "--d": 7 }}>Art: Lemuen, alternate outfit © Hypergryph, loaded from a community mirror.</p>
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
  const [stage, setStage] = useState<"idle" | "cover" | "reveal">(() => (shouldPlayIntro() ? "cover" : "idle"));
  const altar = useRef<HTMLDivElement>(null);

  // First visit: the intro plays over the page. Its opening beat needs no art, so it starts at once while the art loads.
  useEffect(() => {
    if (stage !== "cover") return;
    let gone = false;
    import("../intro/intro").then(({ runIntro }) => {
      if (gone) return;
      const root = document.createElement("div");
      document.body.append(root);
      runIntro(root, {
        artSrc: HERO_ART,
        halo: () => {
          const r = altar.current!.getBoundingClientRect();
          return [r.left + r.width * HALO[0], r.top + r.height * HALO[1]];
        },
        onReveal: () => setStage("reveal"),
        onDone: (how) => {
          root.remove();
          if (how !== "failed") setPref(INTRO_KEY, "1"); // too slow this time: the art is cached for next visit
          if (how !== "done") setStage("idle");
        },
      });
    }, () => setStage("idle"));
    return () => { gone = true; };
  }, []);

  return (
    <div class="fade-in">
      {stage === "cover" && <div class="iv-cover" aria-hidden="true" />}
      <Hero stage={stage === "reveal" ? "reveal" : "idle"} altarRef={altar} />

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
