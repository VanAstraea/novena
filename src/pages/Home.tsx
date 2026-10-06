import { useEffect, useRef, useState } from "preact/hooks";
import { Feathers } from "../components/Feathers";
import { searchOpen } from "../components/Search";
import { Avatar, Await, Divider, Explain, GuideLink, PortraitCard, useAsync } from "../components/ui";
import { art, BASE, operators, stages as loadStages, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, dayTime, duration, fmt, pct, relative } from "../lib/format";
import { href, route } from "../lib/router";
import { pref, setPref } from "../lib/storage";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../lib/time";
import { BuildMarks } from "../components/Marks";
import { lastPlan } from "../lib/account";
import { importFile, loadSample } from "../lib/accountImport";
import { autoPriorities, filtersOn, prioStatus } from "../lib/priorities";
import { account, hasRoster, SERVERS, server } from "../state";
import type { OpIndex } from "../types";


// The hero: Lemuen in her alternate outfit, set like an altarpiece in a vaulted nave. The nave and the rose window
// behind the account panel are Novena's own drawings (docs/design/bg/make_bg.py), not game art.
const HERO_ART = art.skin("char_4193_lemuen_ambienceSynesthesia#7b");
const HERO_SCENE = `${BASE}bg/nave.svg`;
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

function Hero({ stage, altarRef, settled }: { stage: "idle" | "reveal"; altarRef: { current: HTMLDivElement | null }; settled: boolean }) {
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
        {!loaded && <div class="hero-wait" aria-hidden="true"><i /><i /></div>}
        <img class={`hero-art${loaded ? " loaded" : ""}`} src={HERO_ART} alt="Lemuen in her alternate outfit, seated before a golden pipe organ"
          {...{ fetchpriority: "high" }} decoding="async" onLoad={() => setLoaded(true)} />
      </div>
      {settled && <Feathers />}
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

// The account is Novena's main feature, so it gets the first panel under the hero: bring a roster in (sync, a file
// dropped right here, or by hand), or, once there is one, a summary with the way back in.
const ACCOUNT_SCENE = `${BASE}bg/rose.svg`;

function AccountPanel({ ops }: { ops: OpIndex[] | null }) {
  const s = server.value;
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const a = account.value;
  const list = Object.values(a.ops);
  useEffect(() => { if (hasRoster.value) void autoPriorities(); }, [hasRoster.value]);
  const byId = new Map((ops || []).map((o) => [o.id, o]));
  const next = (lastPlan.value?.result.steps || []).slice(0, 3);
  const onFile = async (f: File) => {
    if (!ops) return;
    try { setMsg({ ok: true, text: await importFile(f, ops, s, "replace") }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const drop = (
    <label class={`acct-drop${over ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void onFile(f); }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4" /></svg>
      <span><strong>{hasRoster.value ? "Drop a newer file" : "Drop a file here"}</strong><small>or choose one · Novena Sync, game sync data, a Krooster profile or a Novena file</small></span>
      <input type="file" accept=".json,.html,.htm,.csv,.txt,application/json,text/html" class="sr-only" disabled={!ops}
        onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }} />
    </label>
  );
  return (
    <section class="acct" aria-labelledby="acct-h">
      <img class="acct-bg" src={ACCOUNT_SCENE} alt="" loading="lazy" />
      <svg class="acct-edge" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="10" x2="100" y2="0" stroke="#c99c50" stroke-opacity="0.7" stroke-width="1" vector-effect="non-scaling-stroke" /></svg>
      <div class="acct-glass glass">
        <p class="eyebrow">Your account</p>
        {hasRoster.value ? (
          <>
            <h2 id="acct-h" class="display">{a.source === "sample" ? "A sample roster" : "Welcome back, Doctor"}</h2>
            <p class="motto">Plans · Farming · Progress</p>
            <p class="meta">Roster {a.source === "novena-sync" ? "synced" : "updated"} {relative(a.updated)}</p>
            <div class="acct-stats">
              <div><span>{fmt(list.length)}</span>operators</div>
              <div><span>{fmt(list.filter((o) => o.elite >= 2).length)}</span>at Elite 2</div>
              <div><span>{fmt(list.reduce((n, o) => n + o.masteries.filter((m) => m >= 3).length, 0))}</span>M3 skills</div>
            </div>
            <div class="acct-next">
              <p class="eyebrow" style={{ margin: "0 0 8px" }}>Raise next{filtersOn() ? " · filtered" : ""}</p>
              {next.length ? (
                <ol>
                  {next.map((st, i) => {
                    const op = byId.get(st.id);
                    return op ? (
                      <li key={i}><a href={href(`/operator/${op.id}`)} data-panel={op.id}><Avatar op={op} size="sm" /><span class="op-name">{op.name}</span></a><BuildMarks s={st.after} from={st.before} op={op} /></li>
                    ) : null;
                  })}
                </ol>
              ) : <p class="meta" style={{ margin: 0 }}>{prioStatus.value ? "Working out what to raise next…" : "Your priorities appear here."}</p>}
            </div>
            <div class="acct-actions">
              <a class="pill primary" href={href("/today")}>Open my account <span aria-hidden="true">→</span></a>
              <a class="pill" href={href("/plan")}>All priorities</a>
              <a class="pill" href={href("/roster", { tab: "import" })}>Sync again</a>
            </div>
            {drop}
            <p class="acct-try"><GuideLink label="Step-by-step import guide" /></p>
          </>
        ) : (
          <>
            <h2 id="acct-h" class="display">Import your roster</h2>
            <p class="motto">Plans · gaps · a daily Sanity Dump</p>
            <p class="acct-lede">Novena plans around what you own: who to raise next, what you're short of, and the cheapest way to farm it. Your roster stays in this browser.</p>
            <ol class="acct-ways">
              <li><strong>Novena Sync</strong><span>A small app for your computer that brings your operators, depot and base over in one click, whenever you like. Your sign-in never leaves your PC.</span><a href={href("/roster", { tab: "import" })}>Set it up →</a></li>
              <li><strong>A file</strong><span>Game sync data, a Novena file from another browser, or your Krooster profile (<a href={href("/guide", { m: "krooster" })}>how</a>).</span>{drop}</li>
              <li><strong>By hand</strong><span>A quick editor: search, tick, set elite and level in a few clicks.</span><a href={href("/roster")}>Start adding →</a></li>
            </ol>
            <p class="acct-try">Not sure which? <GuideLink label="Compare them in the import guide" /></p>
            <p class="acct-try">Just looking? <button class="linkish" disabled={!ops} onClick={async () => { if (ops) { await loadSample(ops); setMsg({ ok: true, text: "Loaded a sample roster: look around Today, Priorities, Roster and Base." }); } }}>Try it with a sample roster</button> <span class="muted">(made up; clear it any time)</span></p>
          </>
        )}
        {msg && (
          <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ margin: "10px 0 0" }}>
            {msg.text} {msg.ok && <a href={href("/today")}>Open my account →</a>}
          </p>
        )}
      </div>
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
  const [settled, setSettled] = useState(stage === "idle"); // feathers start once the intro (if any) has finished

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
          setSettled(true);
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
      <Hero stage={stage === "reveal" ? "reveal" : "idle"} altarRef={altar} settled={settled} />
      <AccountPanel ops={st.data ? st.data[0] : null} />

      <Divider />

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
