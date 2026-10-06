// Today, the account's home (after ako's Overview and Today): your account at a glance, what's next, what changed,
// progress over time, the sanity timer, and the day's routine as a checklist. Ticks are kept per server and per game
// day (weekly ones per game week) in this browser, and clear themselves at the reset.
import { useEffect, useMemo, useState } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { Chart } from "../components/Chart";
import { SanityTimer } from "../components/SanityTimer";
import { Await, CutHead, Divider, Explain, itemName, itemsSig, metaSig, OpLink, useAsync } from "../components/ui";
import { costTable, lastPlan } from "../lib/account";
import { LMD, sanity } from "../lib/costs";
import { diff } from "../lib/progress";
import { autoPriorities, filtersOn, prioStatus } from "../lib/priorities";
import { setTimerAlerts, timerAlerts, timerRows } from "../lib/timers";
import { expiring } from "../lib/consumables";
import { operators, stages as loadStages, upcoming as loadUpcoming } from "../lib/data";
import { date, fmt, duration, relative } from "../lib/format";
import { href } from "../lib/router";
import { pref, setPref } from "../lib/storage";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../lib/time";
import { account, hasRoster, server, targets } from "../state";

interface Task { id: string; label: string; note?: string; link?: [string, string]; weekly?: boolean; custom?: boolean }

const DAILY: Task[] = [
  { id: "base", label: "Collect from the base", note: "Trading Post orders, Factory products, trust and morale in the dorms", link: ["/base", "Base plan"] },
  { id: "drones", label: "Use your drones before they cap", note: "On a Trading Post for LMD or a Factory making Pure Gold; with Novena Sync, Timers below shows when they'll be full", link: ["/base", "Your base"] },
  { id: "clues", label: "Clues", note: "Reception Room: collect the daily clue and any from friends, send your spares, and start a Clue Exchange once you hold all seven" },
  { id: "shifts", label: "Swap base shifts if they're due", link: ["/base", "Who goes where"] },
  { id: "recruit", label: "Collect and refill recruitments", link: ["/recruit", "Recruitment calculator"] },
  { id: "sanity", label: "Spend your sanity", link: ["/dump", "Today's runs"] },
  { id: "credits", label: "Visit friends' bases and collect credits" },
  { id: "store", label: "Buy from the Credit Store", note: "Discounted materials first" },
  { id: "missions", label: "Daily missions" },
];
const WEEKLY: Task[] = [
  { id: "annihilation", label: "Annihilation: 1,800 Orundum", weekly: true },
  { id: "weekly-missions", label: "Weekly missions", weekly: true },
];

function useTicks(key: string): [Set<string>, (id: string) => void] {
  const [ticks, setTicks] = useState<Set<string>>(() => { try { return new Set(JSON.parse(pref(key, "[]"))); } catch { return new Set(); } });
  const [seen, setSeen] = useState(key);
  if (seen !== key) { // a new day (or server): start fresh
    setSeen(key);
    try { setTicks(new Set(JSON.parse(pref(key, "[]")))); } catch { setTicks(new Set()); }
  }
  const toggle = (id: string) => {
    const next = new Set(ticks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTicks(next);
    setPref(key, JSON.stringify([...next]));
  };
  return [ticks, toggle];
}

export default function Today() {
  const s = server.value;
  const now = Date.now();
  const day = gameDay(s, now).start, week = nextWeeklyReset(s, now);
  const [daily, toggleDaily] = useTicks(`ticks.${s}.d.${day}`);
  const [weekly, toggleWeekly] = useTicks(`ticks.${s}.w.${week}`);
  const [custom, setCustom] = useState<Task[]>(() => { try { return JSON.parse(pref(`tasks.${s}`, "[]")); } catch { return []; } });
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(pref(`tasksHidden.${s}`, "[]")); } catch { return []; } });
  const [draft, setDraft] = useState("");
  const [draftWeekly, setDraftWeekly] = useState(false);
  const up = useAsync(() => loadUpcoming(s).catch(() => null), [s]);
  const saveCustom = (t: Task[]) => { setCustom(t); setPref(`tasks.${s}`, JSON.stringify(t)); };
  const saveHidden = (h: string[]) => { setHidden(h); setPref(`tasksHidden.${s}`, JSON.stringify(h)); };

  const extra: Task[] = useMemo(() => {
    const out: Task[] = [];
    for (const e of up.data?.running || []) out.push({ id: `event.${e.id}`, label: `Event: ${e.name}`, note: `Ends ${date(e.end)}: clear its stages and spend its tokens`, link: ["/upcoming?view=shops", "Event shops"] });
    const items = itemsSig.value;
    if (items) {
      const soon = expiring(account.value, items, now).filter((x) => x.ts * 1000 - now < 7 * 86400_000);
      if (soon.length) out.push({ id: "expiring", label: "Use items that expire this week", note: soon.map((x) => `${x.count} × ${itemName(x.id)}`).join(", "), link: ["/roster?tab=use", "To use"] });
    }
    return out;
  }, [up.data, itemsSig.value, account.value]);

  const days = [...DAILY, ...extra, ...custom.filter((t) => !t.weekly)].filter((t) => !hidden.includes(t.id));
  const weeks = [...WEEKLY, ...custom.filter((t) => t.weekly)].filter((t) => !hidden.includes(t.id));
  const done = days.filter((t) => daily.has(t.id)).length + weeks.filter((t) => weekly.has(t.id)).length;
  const total = days.length + weeks.length;

  const row = (t: Task, ticked: boolean, toggle: (id: string) => void) => (
    <li key={t.id} class={ticked ? "done" : ""}>
      <label class="check">
        <input type="checkbox" checked={ticked} onChange={() => toggle(t.id)} />
        <span><strong>{t.label}</strong>{t.note && <><br /><small class="muted">{t.note}</small></>}</span>
      </label>
      <span class="row tight">
        {t.link && <a class="btn ghost small" href={href(t.link[0].split("?")[0]) + (t.link[0].includes("?") ? "?" + t.link[0].split("?")[1] : "")}>{t.link[1]}</a>}
        {t.custom
          ? <button class="ghost small" title="Remove" aria-label={`Remove ${t.label}`} onClick={() => saveCustom(custom.filter((c) => c.id !== t.id))}>×</button>
          : <button class="ghost small" title="Hide from the list" aria-label={`Hide ${t.label}`} onClick={() => saveHidden([...hidden, t.id])}>×</button>}
      </span>
    </li>
  );

  return (
    <div class="stack fade-in">
      <h1>Today</h1>
      <WeekBand />
      {hasRoster.value && <><Overview /><Divider /></>}
      <div class="today-cols">
      <aside class="today-side">
        <SanityTimer />
        <Timers />
      </aside>
      <div class="today-main">
      <section class="card">
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Checklist</h2>
          <span class="muted">Resets in {duration(nextDailyReset(s, now) - now)}</span>
        </div>
        <div class="bar" style={{ margin: "10px 0" }} role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="Done today"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <p class="muted" style={{ margin: "0 0 8px" }}>{done} of {total} done</p>
        <Await state={up} what="today's events">{() => <ul class="checklist">{days.map((t) => row(t, daily.has(t.id), toggleDaily))}</ul>}</Await>
        <h3 style={{ marginTop: "16px" }}>This week <small class="muted">· resets in {duration(week - now)}</small></h3>
        <ul class="checklist">{weeks.map((t) => row(t, weekly.has(t.id), toggleWeekly))}</ul>
        <form class="row" style={{ marginTop: "14px" }} onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          saveCustom([...custom, { id: `c${Date.now()}`, label: draft.trim(), weekly: draftWeekly, custom: true }]);
          setDraft("");
        }}>
          <input type="text" placeholder="Add your own task" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} style={{ flex: "1 1 240px" }} />
          <label class="row tight"><input type="checkbox" checked={draftWeekly} onChange={(e) => setDraftWeekly((e.target as HTMLInputElement).checked)} /> weekly</label>
          <button type="submit">Add</button>
          {hidden.length > 0 && <button type="button" class="ghost" onClick={() => saveHidden([])}>Show {hidden.length} hidden</button>}
        </form>
      </section>
      <Explain>Ticks are kept in this browser, per server, and clear at the daily reset (weekly ones at the weekly reset). Novena can't see your game, so it doesn't know what you've done: tick things off as you go.</Explain>
      </div>
      </div>
    </div>
  );
}

/** The account at a glance: totals, what's next, what changed since an earlier day, and progress over time. */
function Overview() {
  useEffect(() => { void autoPriorities(); }, []);
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), costTable(s), loadStages(s), loadUpcoming(s).catch(() => null)]), [s]);
  const a = account.value;
  const ops = Object.values(a.ops);
  const masteries = ops.reduce((n, o) => n + o.masteries.reduce((x, y) => x + y, 0), 0);
  const tiles: [string, number][] = [
    ["Operators", ops.length], ["Elite 2", ops.filter((o) => o.elite >= 2).length], ["Masteries", masteries],
    ["M3 skills", ops.reduce((n, o) => n + o.masteries.filter((m) => m >= 3).length, 0)],
    ["Modules", ops.reduce((n, o) => n + Object.values(o.modules).filter((m) => m > 0).length, 0)], ["LMD held", a.depot[LMD] || 0],
  ];
  const snaps = a.snapshots;
  return (
    <>
      <div class="tiles6">
        {tiles.map(([k, v]) => <div key={k} class="stat"><div class="k">{k}</div><div class="v">{fmt(v)}</div></div>)}
      </div>
      <Await state={st} what="your account">
        {([list, costs, stg, up]) => {
          const byId = new Map(list.map((o) => [o.id, o]));
          const weekday = gameDay(s).weekday;
          const steps = (lastPlan.value?.result.steps || []).slice(0, 4);
          const today = new Date().toDateString();
          const earlier = snaps.filter((x) => x.roster && new Date(x.t).toDateString() !== today);
          const base = earlier[earlier.length - 1];
          const meta = metaSig.value, items = itemsSig.value;
          const change = base && meta && items ? diff({ roster: base.roster!, depot: base.depot || {} }, { roster: a.ops, depot: a.depot }, costs, meta.const, byId) : null;
          const raised = change ? new Set(change.changes.map((c) => c.id)).size : 0;
          return (
            <>
              <div class="next-grid" style={{ marginTop: "12px" }}>
                <section class="card">
                  <h2 class="label">Next priorities{filtersOn() ? " · filtered" : ""}</h2>
                  {steps.length ? (
                    <ul>{steps.map((x, i) => { const op = byId.get(x.id); return <li key={i}>{op ? <OpLink op={op} sub={<BuildMarks s={x.after} from={x.before} op={op} />} /> : x.id}</li>; })}</ul>
                  ) : targets.value.length ? (
                    <ul>{targets.value.slice(0, 4).map((t) => { const op = byId.get(t.id); return <li key={t.id}>{op ? <OpLink op={op} sub={t.text} /> : t.text}</li>; })}</ul>
                  ) : <p class="muted">{prioStatus.value ? `Working out what to raise next: ${prioStatus.value.toLowerCase()}…` : "Nothing to suggest yet."}</p>}
                  {steps.length > 0 && <a class="btn small" href={href("/plan")} style={{ marginTop: "8px" }}>All priorities</a>}
                </section>
                <section class="card">
                  <h2 class="label">Open today</h2>
                  <p style={{ margin: 0 }}>{stg.zones.filter((z) => z.days.includes(weekday)).map((z) => `${z.prefix} · ${z.name}`).join(", ") || "Only the always-open stages."}</p>
                  {(up?.running || []).map((e) => <p key={e.id} style={{ margin: "8px 0 0" }}><strong>{e.name}</strong> <span class="muted">ends {date(e.end)}</span></p>)}
                  <a class="btn small" href={href("/dump")} style={{ marginTop: "8px" }}>Today's runs</a>
                </section>
                <section class="card">
                  <h2 class="label">Since {base ? date(base.t) : "your first day here"}</h2>
                  {change && raised ? (
                    <p style={{ margin: 0 }}><strong>{raised}</strong> operator{raised === 1 ? "" : "s"} raised, worth about <strong>{fmt(sanity(change.spent, items!.values))}</strong> sanity of materials, {fmt(change.spent[LMD] || 0)} LMD.</p>
                  ) : <p class="muted" style={{ margin: 0 }}>{base ? "Nothing raised since then." : "From tomorrow, what you raise shows here."}</p>}
                  <a class="btn small" href={href("/roster", { tab: "progress" })} style={{ marginTop: "8px" }}>What changed</a>
                </section>
              </div>
              {snaps.length > 1 && (
                <div class="grid two" style={{ marginTop: "12px" }}>
                  <Chart label="Elite 2 operators" points={snaps.map((x) => [x.t, x.e2])} />
                  <Chart label="M3 skills" points={snaps.map((x) => [x.t, x.m3])} />
                </div>
              )}
            </>
          );
        }}
      </Await>
    </>
  );
}


const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // gameDay: 1 = Monday

/** The day and the week at a glance, on a diagonal-cut band. */
function WeekBand() {
  const s = server.value, now = Date.now();
  return (
    <CutHead eyebrow="This week" art="nave" title={`${WEEKDAYS[gameDay(s).weekday] || "Today"} on ${s.toUpperCase()}`}
      sub={<>Daily reset in {duration(nextDailyReset(s, now) - now)} · weekly reset {relative(nextWeeklyReset(s, now), now)}</>} />
  );
}

/** Everything with a clock, from the last Novena Sync and the sanity timer, soonest first. */
function Timers() {
  const a = account.value, s = server.value;
  if (!a.recruit?.length && !a.base) return null;
  const now = Date.now();
  const rows = timerRows(a, s);
  const canNotify = typeof Notification !== "undefined";
  return (
    <section class="card">
      <div class="row" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
        <h2 style={{ margin: 0 }}>Timers</h2>
        {canNotify && <button class={timerAlerts.value ? "primary small" : "small"} aria-pressed={timerAlerts.value} onClick={() => void setTimerAlerts(!timerAlerts.value)}
          title="A browser notification when a recruitment is ready, a factory stops or the drones are full, while a Novena tab is open">{timerAlerts.value ? "Notifying" : "Notify me"}</button>}
      </div>
      <ul class="timers">
        {rows.map((r, i) => (
          <li key={i} class={r.at <= now ? "due" : ""}>
            <span>{r.what}{r.note && <small class="muted"> · {r.note}</small>}</span>
            <strong>{r.at <= now ? "Ready" : `in ${duration(r.at - now)}`}</strong>
          </li>
        ))}
      </ul>
      <Explain>From your last Novena Sync ({relative(a.base?.at || a.updated)}) and the sanity timer. They count from the sync, so they stay right until you change something in the game.</Explain>
    </section>
  );
}
