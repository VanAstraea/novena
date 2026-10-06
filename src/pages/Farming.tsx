// Farming planner: the cheapest stage runs for what's missing, scheduled over the days ahead.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Await, Explain, ItemIcon, Items, itemName, itemsSig, metaSig, useAsync } from "../components/ui";
import { LMD, type Cost } from "../lib/costs";
import { EXP_CARDS } from "../lib/crafting";
import { undoable } from "../components/Toast";
import { operator, operators, stages as loadStages } from "../lib/data";
import { DAILY_SANITY, plan, schedule, type FarmPlan } from "../lib/farming";
import { compact, date, dayTime, fmt } from "../lib/format";
import { planTarget, totalCost } from "../lib/plan";
import { href, route, setQuery } from "../lib/router";
import { gameDay, nextDailyReset, nextWeeklyReset, WEEKDAYS } from "../lib/time";
import { account, prefs, savePrefs, server, targets } from "../state";
import type { ItemsFile, StagesFile } from "../types";

const parseItems = (s: string | null): Cost =>
  Object.fromEntries((s || "").split(",").map((p) => p.split(":")).filter(([k, n]) => k && +n > 0).map(([k, n]) => [k, +n]));
const encodeItems = (c: Cost) => Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(",");

export default function Farming() {
  const s = server.value;
  const st = useAsync(() => loadStages(s), [s]);
  const items = itemsSig.value;
  return (
    <div class="stack fade-in">
      <h1>Farming planner</h1>
      <Await state={st} what="stages and drop rates">
        {(stg) => (items ? <FarmView stg={stg} items={items} /> : <p class="muted">Loading items…</p>)}
      </Await>
    </div>
  );
}

function ResetCard({ stg }: { stg: StagesFile }) {
  const s = server.value;
  const now = Date.now();
  const { weekday } = gameDay(s, now);
  return (
    <section class="card">
      <h2>Today and this week</h2>
      <dl class="kv">
        <dt>Daily reset</dt><dd>{dayTime(nextDailyReset(s, now))}</dd>
        <dt>Weekly reset</dt><dd>{dayTime(nextWeeklyReset(s, now))}</dd>
      </dl>
      <div class="table-wrap" style={{ marginTop: "10px" }}>
        <table>
          <thead><tr><th>Stages</th>{WEEKDAYS.map((d, i) => <th key={d} class="num" aria-current={i + 1 === weekday ? "date" : undefined}>{i + 1 === weekday ? <u>{d}</u> : d}</th>)}</tr></thead>
          <tbody>
            {stg.zones.map((z) => (
              <tr key={z.id}><td>{z.prefix} <small class="muted">{z.name}</small></td>
                {WEEKDAYS.map((d, i) => <td key={d} class="num">{z.days.includes(i + 1) ? <span aria-label="open">●</span> : <span class="muted" aria-label="closed">·</span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explain>Times are in your time zone. Today (underlined) is the game day, which starts at 04:00 server time.</Explain>
    </section>
  );
}

function FarmView({ stg, items }: { stg: StagesFile; items: ItemsFile }) {
  const q = route.value.query;
  const need = parseItems(q.get("items"));
  const p = prefs.value;
  const [pick, setPick] = useState("");
  const [count, setCount] = useState(10);
  const [result, setResult] = useState<{ plan: FarmPlan; key: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(DAILY_SANITY);
  const [cap, setCap] = useState(135);
  const useDepot = p.useDepot && Object.keys(account.value.depot).length > 0;
  const farmable = useMemo(() => {
    const dropped = new Set(stg.stages.flatMap((s) => Object.keys(s.drops)));
    return Object.entries(items.items).filter(([id, it]) => (dropped.has(id) || items.recipes[id]) && ["material", "chip", "skill"].includes(it.group))
      .sort((a, b) => b[1].rarity - a[1].rarity || a[1].name.localeCompare(b[1].name));
  }, [items, stg]);
  const stageId = q.get("stage");
  const stageRow = stageId ? stg.stages.find((s) => s.id === stageId) : null;
  const allowed = stg.stages.filter((s) => !p.excluded.includes(s.id));
  const key = JSON.stringify([need, useDepot, p.excluded]);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const inv = useDepot ? account.value.depot : {};
      const r = await plan(need, inv, allowed, items.recipes, items.values[LMD] || 0.0036);
      setResult({ plan: r, key });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // arriving with items (from "Farm what's short" or a shared link): plan straight away, no second click
  useEffect(() => { if (Object.keys(need).length) void run(); }, []);

  const fromTargets = async () => {
    const s = server.value;
    const ops = await operators(s);
    const meta = metaSig.value;
    if (!meta) return;
    const rows = await Promise.all(targets.value.map(async (t) => {
      const op = ops.find((o) => o.id === t.id);
      const d = await operator(s, t.id).catch(() => null);
      return op && d ? planTarget(t, op, d, meta, account.value.ops) : null;
    }));
    const total = totalCost(rows.filter((r) => r && !r.error) as { cost: Cost }[]);
    setQuery({ items: encodeItems(total) });
  };

  return (
    <>
      {stageRow && (
        <section class="card">
          <h2>{stageRow.code} <small class="muted">{stageRow.ap} sanity</small></h2>
          <p>Expected drops per run:</p>
          <div class="items">{Object.entries(stageRow.drops).sort((a, b) => b[1] - a[1]).map(([id, r]) => <ItemIcon key={id} id={id} title={`${itemName(id)}: ${r.toFixed(3)} per run`} />)}</div>
          <div class="table-wrap" style={{ marginTop: "8px" }}><table><tbody>
            {Object.entries(stageRow.drops).sort((a, b) => b[1] - a[1]).map(([id, r]) => <tr key={id}><td>{itemName(id)}</td><td class="num">{r.toFixed(3)}</td><td class="num">{(stageRow.ap / r).toFixed(1)} sanity each</td></tr>)}
          </tbody></table></div>
          <Explain>Penguin Statistics drop rates for the {stg.region} server (samples of at least 100 runs).</Explain>
        </section>
      )}
      <section class="card">
        <h2>What do you need?</h2>
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Material</span>
            <select value={pick} onChange={(e) => setPick((e.target as HTMLSelectElement).value)}>
              <option value="">Choose…</option>
              {[5, 4, 3, 2, 1].map((t) => (
                <optgroup key={t} label={`Tier ${t}`}>
                  {farmable.filter(([, it]) => it.rarity === t).map(([id, it]) => <option key={id} value={id}>{it.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label class="field"><span>How many</span><input type="number" min={1} value={count} onChange={(e) => setCount(+(e.target as HTMLInputElement).value || 1)} /></label>
          <button disabled={!pick} onClick={() => { setQuery({ items: encodeItems({ ...need, [pick]: (need[pick] || 0) + count }) }); setPick(""); }}>Add</button>
          <button onClick={fromTargets} disabled={!targets.value.length} title={targets.value.length ? "Everything your planner targets cost" : "Add goals in Materials first"}>Use my planner targets</button>
        </div>
        {Object.keys(need).length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <div class="items">
              {Object.entries(need).map(([id, n]) => (
                <span key={id} class="row tight"><ItemIcon id={id} count={n} />
                  <button class="small ghost" aria-label={`Remove ${itemName(id)}`} onClick={() => { const c = { ...need }; delete c[id]; setQuery({ items: encodeItems(c) }); }}>✕</button></span>
              ))}
            </div>
            <button class="small ghost" style={{ marginTop: "6px" }} onClick={() => setQuery({ items: "" })}>Clear all</button>
          </div>
        )}
        <div class="row" style={{ marginTop: "10px" }}>
          <label class="row tight"><input type="checkbox" checked={p.useDepot} disabled={!Object.keys(account.value.depot).length}
            onChange={(e) => savePrefs({ ...p, useDepot: (e.target as HTMLInputElement).checked })} />
            Subtract my depot {Object.keys(account.value.depot).length ? "" : <small class="muted">(enter it under <a href={href("/roster", { tab: "depot" })}>My account</a>)</small>}</label>
        </div>
        <div class="row" style={{ marginTop: "10px" }}>
          <button class="primary" onClick={run} disabled={busy || !Object.keys(need).length}>{busy ? "Solving…" : "Plan the farming"}</button>
          {result && result.key !== key && <span class="muted">Inputs changed: plan again.</span>}
          {error && <span class="bad-text" role="alert">{error}</span>}
        </div>
        <Explain>A linear program picks the stage runs and Workshop crafts that cover what you need for the least sanity, using Penguin Statistics drop rates for {stg.region} (updated {date(stg.fetched)}). It runs in your browser.</Explain>
      </section>
      {result && <PlanView r={result.plan} stg={stg} items={items} today={today} setToday={setToday} cap={cap} setCap={setCap}
        clear={() => {
          const was = q.get("items") || "";
          setResult(null); setQuery({ items: "" });
          undoable("Farming plan cleared.", () => setQuery({ items: was }));
        }} />}
      <ExcludedCard stg={stg} />
      <ResetCard stg={stg} />
    </>
  );
}

function PlanView({ r, stg, items, today, setToday, cap, setCap, clear }: {
  r: FarmPlan; stg: StagesFile; items: ItemsFile; today: number; setToday: (n: number) => void; cap: number; setCap: (n: number) => void; clear: () => void;
}) {
  const wanted = new Set(r.wanted);
  const value = (id: string) => items.values[id] || 0;
  // Crafts in the order you'd make them: lower tiers first, since higher ones are made from them.
  const crafts = Object.entries(r.crafts).map(([id, n]) => ({ id, times: Math.ceil(n - 1e-6), recipe: items.recipes[id] }))
    .sort((a, b) => (items.items[a.id]?.rarity || 0) - (items.items[b.id]?.rarity || 0));
  const p = prefs.value;
  const s = server.value;
  const whole = r.runs.map((x) => ({ code: x.stage.code, runs: Math.ceil(x.runs - 1e-6), sanity: x.stage.ap }));
  const openDays = Object.fromEntries(r.runs.map((x) => [x.stage.code, x.stage.days || null]));
  const sched = schedule(whole, openDays, gameDay(s).weekday, today, cap, p.daily);
  const ce6 = stg.ce[stg.ce.length - 1];
  const ls = stg.stages.filter((x) => x.id.startsWith("wk_kc_")).map((x) => ({ x, exp: Object.entries(x.drops).reduce((a, [i, n]) => a + n * (EXP_CARDS[i] || 0), 0) / x.ap }))
    .sort((a, b) => b.exp - a.exp)[0];
  return (
    <>
      <section class="card">
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Plan: {fmt(r.sanity)} sanity <small class="muted">≈ {(r.sanity / p.daily).toFixed(1)} days at {p.daily}/day</small></h2>
          <button class="small ghost" onClick={clear} title="Remove this plan and what it was for">Clear plan</button>
        </div>
        <div class="table-wrap">
          <table class="cards">
            <thead><tr><th>Stage</th><th class="num">Runs</th><th class="num">Sanity</th><th title="What these runs should bring of what the plan needs (averages)">You'll get about</th><th>Open</th><th><span class="sr-only">Exclude</span></th></tr></thead>
            <tbody>
              {r.runs.map((x) => {
                const n = Math.ceil(x.runs - 1e-6);
                const gets = Object.entries(x.stage.drops).filter(([id]) => wanted.has(id)).map(([id, rate]) => [id, n * rate] as const)
                  .filter(([, k]) => k >= 0.5).sort((a, b) => value(b[0]) * b[1] - value(a[0]) * a[1]);
                return (
                <tr key={x.stage.id}>
                  <td data-label="Stage"><a href={href("/farming", { ...Object.fromEntries(route.value.query), stage: x.stage.id })}>{x.stage.code}</a></td>
                  <td data-label="Runs" class="num">{Math.ceil(x.runs - 1e-6)}</td>
                  <td data-label="Sanity" class="num">{fmt(Math.ceil(x.runs - 1e-6) * x.stage.ap)}</td>
                  <td data-label="You'll get about"><span class="items">{gets.map(([id, k]) => <ItemIcon key={id} id={id} count={Math.round(k)} title={`${itemName(id)}: about ${Math.round(k)} from ${n} runs`} />)}</span></td>
                  <td data-label="Open">{x.stage.days ? x.stage.days.map((d) => WEEKDAYS[d - 1]).join(" ") : "Always"}</td>
                  <td data-label=""><button class="small ghost" title="Leave this stage out of every plan" onClick={() => savePrefs({ ...p, excluded: [...p.excluded, x.stage.id] })}>Leave out</button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {crafts.length > 0 && (
          <>
            <h3 style={{ marginTop: "12px" }}>Then craft, in this order</h3>
            <ol class="craft-steps">
              {crafts.map((c) => (
                <li key={c.id}>
                  <span class="row tight"><ItemIcon id={c.id} count={c.times * (c.recipe?.count || 1)} /> <span class="muted">from</span>
                    {c.recipe?.costs.map(([i, k]) => <ItemIcon key={i} id={i} count={k * c.times} />)}
                    {c.recipe?.lmd ? <small class="muted">+ {compact(c.recipe.lmd * c.times)} LMD</small> : null}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {Object.keys(r.unmet).length > 0 && <><h3 style={{ marginTop: "12px" }}>No stage drops these</h3><Items cost={r.unmet} /><p class="muted">Get them from shops, events, the Factory (Chip Catalyst) or missions.</p></>}
        {(r.lmdShort > 0 || r.expShort > 0) && (
          <>
            <h3 style={{ marginTop: "12px" }}>LMD and EXP</h3>
            <ul>
              {r.lmdShort > 0 && <li>{compact(r.lmdShort)} LMD short: {Math.ceil(r.lmdShort / ce6.lmd)} runs of {ce6.code} ({fmt(Math.ceil(r.lmdShort / ce6.lmd) * ce6.ap)} sanity)</li>}
              {r.expShort > 0 && ls && <li>{compact(r.expShort)} EXP short: about {Math.ceil(r.expShort / (ls.exp * ls.x.ap))} runs of {ls.x.code} ({fmt(Math.ceil(r.expShort / ls.exp))} sanity)</li>}
            </ul>
          </>
        )}
        <Explain>Runs are rounded up per stage. "You'll get about" is what those runs should drop of the items this plan needs, so you can tick a stage off when you have them; drops are averages, so expect some variance. Crafts are only the ones the plan relies on, lower tiers first. "Leave out" drops a stage from every plan, for example one you haven't cleared yet.</Explain>
      </section>
      <section class="card">
        <h2>Day by day</h2>
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Sanity to spend today</span><input type="number" min={0} value={today} onChange={(e) => setToday(+(e.target as HTMLInputElement).value || 0)} /></label>
          <label class="field"><span>Daily sanity</span><input type="number" min={1} value={p.daily} onChange={(e) => savePrefs({ ...p, daily: +(e.target as HTMLInputElement).value || DAILY_SANITY })} /></label>
          <label class="field"><span>Sanity cap</span><input type="number" min={80} value={cap} onChange={(e) => setCap(+(e.target as HTMLInputElement).value || 135)} /></label>
        </div>
        <div class="table-wrap" style={{ marginTop: "10px" }}>
          <table class="cards">
            <thead><tr><th>Day</th><th>Runs</th><th class="num">Sanity</th></tr></thead>
            <tbody>
              {sched.days.filter((d) => d.runs.length).slice(0, 60).map((d) => (
                <tr key={d.offset}>
                  <td data-label="Day">{d.offset === 0 ? "Today" : d.offset === 1 ? "Tomorrow" : `${WEEKDAYS[d.weekday - 1]} (+${d.offset})`}</td>
                  <td data-label="Runs">{d.runs.map((x) => `${x.code} ×${x.runs}`).join(", ")}</td>
                  <td data-label="Sanity" class="num">{x(d.runs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted" style={{ marginTop: "6px" }}>{sched.last !== null ? `Done in ${sched.last + 1} day${sched.last ? "s" : ""}.` : "Takes longer than 120 days at this rate."}</p>
        <Explain>Natural regeneration only (no potions or Originite Prime). Weekday stages go first on their days; unspent sanity carries over up to the cap.</Explain>
      </section>
    </>
  );
}

const x = (runs: { sanity: number }[]) => fmt(runs.reduce((s, r) => s + r.sanity, 0));

function ExcludedCard({ stg }: { stg: StagesFile }) {
  const p = prefs.value;
  const [add, setAdd] = useState("");
  return (
    <section class="card">
      <h2>Stages left out</h2>
      <p class="muted">Stages listed here are left out of every plan: ones you haven't cleared yet, or would rather not farm.</p>
      <div class="chips">
        {p.excluded.map((id) => {
          const st = stg.stages.find((s) => s.id === id);
          return <button key={id} class="chip" onClick={() => savePrefs({ ...p, excluded: p.excluded.filter((e) => e !== id) })} aria-label={`Allow ${st?.code || id} again`}>{st?.code || id} ✕</button>;
        })}
        {!p.excluded.length && <span class="muted">None.</span>}
      </div>
      <div class="row" style={{ marginTop: "8px" }}>
        <select value={add} onChange={(e) => setAdd((e.target as HTMLSelectElement).value)} aria-label="Stage to leave out">
          <option value="">Leave out a stage…</option>
          {stg.stages.filter((s) => !p.excluded.includes(s.id)).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <button disabled={!add} onClick={() => { savePrefs({ ...p, excluded: [...p.excluded, add] }); setAdd(""); }}>Leave out</button>
      </div>
    </section>
  );
}

