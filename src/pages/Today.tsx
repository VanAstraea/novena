// Today: the day's routine as a checklist with ticks (ported from ako's Today), plus the sanity timer. Ticks are kept
// per server and per game day (weekly ones per game week) in this browser, and clear themselves at the reset.
import { useMemo, useState } from "preact/hooks";
import { SanityTimer } from "../components/SanityTimer";
import { Await, Explain, itemName, itemsSig, useAsync } from "../components/ui";
import { expiring } from "../lib/consumables";
import { upcoming as loadUpcoming } from "../lib/data";
import { date, duration } from "../lib/format";
import { href } from "../lib/router";
import { pref, setPref } from "../lib/storage";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../lib/time";
import { account, server } from "../state";

interface Task { id: string; label: string; note?: string; link?: [string, string]; weekly?: boolean; custom?: boolean }

const DAILY: Task[] = [
  { id: "base", label: "Collect from the base", note: "Trading Post orders, Factory products, Reception clues", link: ["/base", "Base plan"] },
  { id: "drones", label: "Use your drones", note: "On a Trading Post (LMD) or a Gold Factory" },
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
      <SanityTimer />
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
  );
}
