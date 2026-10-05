// Sanity Dump (after ako's dump.py): what today's sanity should go into. Demand is everything you're working
// toward, counted together: your Planner targets (or the built plan), plus the community builds of your strongest
// operators the plan doesn't cover. The depot pays it once, crafting included; the materials held least against what
// they're needed for come first, and the farming planner turns the top of that list into today's runs.
import { useState } from "preact/hooks";
import { Await, Explain, ItemIcon, Items, itemsSig, metaSig, useAsync } from "../components/ui";
import { communityState, costTable, goalStates, lastPlan, rosterStates } from "../lib/account";
import { add, EXP, LMD, sanity, stateCost, type Cost, type CostData, type OpState } from "../lib/costs";
import { Stock } from "../lib/crafting";
import { operators, stages as loadStages, usage as loadUsage } from "../lib/data";
import { plan as farmPlan, schedule } from "../lib/farming";
import { dayTime, fmt, pct } from "../lib/format";
import { href } from "../lib/router";
import { gameDay, nextWeeklyReset, WEEKDAYS } from "../lib/time";
import { account, hasRoster, prefs, server, targets } from "../state";
import type { ItemsFile, OpIndex, StagesFile, UsageFile } from "../types";

const OPERATORS = 40;
const DEEP_RATE = 0.3;
const ANNI_SANITY = 25;

interface Lacking { id: string; held: number; need: number; short: number; coverage: number; near: boolean; value: number }

export default function Dump() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage(), costTable(s), loadStages(s)]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Sanity Dump</h1>
      {!hasRoster.value ? (
        <div class="card"><p>The Sanity Dump aims today's sanity at what your account lacks most, so it needs your roster and depot. <a href={href("/roster")}>Add them under My roster</a>.</p></div>
      ) : (
        <Await state={st} what="account data">
          {([ops, usage, costs, stg]) => (itemsSig.value && metaSig.value ? <DumpView ops={ops} usage={usage} costs={costs} stg={stg} items={itemsSig.value} /> : <p class="muted">Loading…</p>)}
        </Await>
      )}
    </div>
  );
}

function demandOf(ops: OpIndex[], usage: UsageFile, costs: Record<string, CostData>, deep: boolean): { near: Cost; far: Cost; counted: number; covered: Set<string> } {
  const meta = metaSig.value!;
  const byId = new Map(ops.map((o) => [o.id, o]));
  const states = rosterStates(account.value, costs);
  const near: Cost = {};
  const covered = new Set<string>();
  const built = lastPlan.value?.result;
  if (built) {
    for (const st of [...built.goals, ...built.steps]) { add(near, st.cost); covered.add(st.id); }
  } else {
    const goals = goalStates(targets.value, states, costs, byId);
    for (const [id, to] of Object.entries(goals)) { add(near, stateCost(costs[id], meta.const, states[id], to, !!byId.get(id)?.patch)); covered.add(id); }
  }
  const owned = Object.keys(states).filter((id) => !covered.has(id) && byId.has(id))
    .sort((a, b) => (usage.ops[b]?.score || 0) - (usage.ops[a]?.score || 0));
  const far: Cost = {};
  let counted = 0;
  for (const id of deep ? owned : owned.slice(0, OPERATORS)) {
    const op = byId.get(id)!;
    const from = states[id];
    let to: OpState | null = communityState(op, usage, costs[id], from);
    if (deep && op.rarity >= 4) {
      const inv = usage.ops[id]?.inv;
      const base = to || from;
      const masteries = base.masteries.map((m, i) => ((inv?.m3[String(i + 1)] || 0) >= DEEP_RATE ? 3 : m));
      const modules = { ...base.modules };
      for (const [k, r] of Object.entries(inv?.mod3 || {})) if (r >= DEEP_RATE && k in modules) modules[k] = 3;
      if (masteries.some((m, i) => m > base.masteries[i]) || Object.keys(modules).some((k) => modules[k] > base.modules[k])) {
        to = { ...base, elite: 2, level: Math.max(base.elite === 2 ? base.level : 1, costs[id].modules.find((m) => modules[m.letter] > (base.modules[m.letter] || 0))?.unlock.level || 1), skillLevel: masteries.some((m) => m) ? 7 : base.skillLevel, masteries, modules };
      }
    }
    if (!to) continue;
    const c = stateCost(costs[id], meta.const, from, to, !!op.patch);
    if (Object.keys(c).length) { add(far, c); counted++; }
  }
  return { near, far, counted, covered };
}

function DumpView({ ops, usage, costs, stg, items }: { ops: OpIndex[]; usage: UsageFile; costs: Record<string, CostData>; stg: StagesFile; items: ItemsFile }) {
  const s = server.value;
  const [now, setNow] = useState(prefs.value.daily);
  const [potions, setPotions] = useState(0);
  const [anni, setAnni] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof compute>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = Math.max(0, now + potions - anni * ANNI_SANITY);

  async function compute() {
    const depot = account.value.depot;
    const pay = (need: Cost) => {
      const stock = new Stock(depot, items.recipes);
      const short: Cost = {};
      for (const [id, n] of Object.entries(need)) Object.assign(short, stock.pay({ [id]: n }));
      return short;
    };
    let d = demandOf(ops, usage, costs, false);
    let demand = add({ ...d.near }, d.far);
    let short = pay(demand);
    let depth = "builds";
    if (sanity(short, items.values) < today) {
      d = demandOf(ops, usage, costs, true);
      demand = add({ ...d.near }, d.far);
      short = pay(demand);
      depth = "deep";
    }
    const nearShort = pay(d.near);
    const farmable = (id: string) => ["material", "chip", "skill"].includes(items.items[id]?.group || "");
    const row = (id: string, n: number): Lacking => ({
      id, held: depot[id] || 0, need: Math.ceil(demand[id] || 0), short: Math.ceil(n),
      coverage: demand[id] ? (depot[id] || 0) / demand[id] : 1, near: (nearShort[id] || 0) > 0, value: (items.values[id] || 0) * n,
    });
    const lacking = Object.entries(short).filter(([id]) => farmable(id)).map(([id, n]) => row(id, n))
      .sort((a, b) => Number(!a.near) - Number(!b.near) || Math.round(a.coverage * 100) - Math.round(b.coverage * 100) || b.value - a.value);
    const stock = Object.keys(demand).filter((id) => farmable(id) && !short[id] && items.items[id]?.group === "material" && items.items[id].rarity >= 3)
      .map((id) => row(id, 0)).sort((a, b) => a.coverage - b.coverage);
    const allowed = stg.stages.filter((x) => !prefs.value.excluded.includes(x.id));
    let runs: { code: string; runs: number; sanity: number }[] = [];
    let farmed: Lacking[] = [];
    let days: ReturnType<typeof schedule>["days"] = [];
    const tries: [Lacking[], Lacking[]][] = [...[3, 6, 10, lacking.length].filter((k, i, a) => lacking.length && a.indexOf(k) === i).map((k) => [lacking.slice(0, k), []] as [Lacking[], Lacking[]]),
      ...[3, 6, 10].filter(() => stock.length).map((k) => [lacking, stock.slice(0, k)] as [Lacking[], Lacking[]])];
    for (const [want, extra] of tries) {
      const target: Cost = {};
      for (const r of want) target[r.id] = r.short;
      for (const r of extra) target[r.id] = (target[r.id] || 0) + r.need;
      const p = await farmPlan(target, {}, allowed, items.recipes, items.values[LMD] || 0.0036);
      const whole = p.runs.map((x) => ({ code: x.stage.code, runs: Math.ceil(x.runs - 1e-6), sanity: x.stage.ap }));
      const open = Object.fromEntries(p.runs.map((x) => [x.stage.code, x.stage.days || null]));
      const sch = schedule(whole, open, gameDay(s).weekday, today, 135 + 45, prefs.value.daily);
      runs = sch.days.find((x) => x.offset === 0)?.runs || [];
      days = sch.days.slice(0, 7);
      farmed = [...want, ...extra];
      if (runs.reduce((a, r) => a + r.sanity, 0) >= today * 0.85) break;
    }
    // stages the player left out that would make the shortfall cheaper to farm
    const unlocks: { code: string; saves: number }[] = [];
    const goal = Object.fromEntries(Object.entries(short).filter(([id]) => farmable(id)));
    if (Object.keys(goal).length && prefs.value.excluded.length) {
      const base = await farmPlan(goal, {}, allowed, items.recipes);
      for (const id of prefs.value.excluded) {
        const st = stg.stages.find((x) => x.id === id);
        if (!st) continue;
        const withIt = await farmPlan(goal, {}, [...allowed, st], items.recipes);
        if (base.sanity - withIt.sanity >= 1) unlocks.push({ code: st.code, saves: Math.round(base.sanity - withIt.sanity) });
      }
      unlocks.sort((a, b) => b.saves - a.saves);
    }
    return { lacking, stock, runs, farmed, days, depth, counted: d.counted, near: Object.keys(d.near).length > 0, unlocks, lmd: short[LMD] || 0, exp: short[EXP] || 0, plan: !!lastPlan.value };
  }

  const go = async () => {
    setBusy(true);
    setError("");
    try { setResult(await compute()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Sanity to spend now</span><input type="number" min={0} value={now} onChange={(e) => setNow(+(e.target as HTMLInputElement).value || 0)} /></label>
          <label class="field"><span>Potions expiring soon (sanity)</span><input type="number" min={0} value={potions} onChange={(e) => setPotions(+(e.target as HTMLInputElement).value || 0)} /></label>
          <label class="field"><span>Annihilation runs left this week</span><input type="number" min={0} max={10} value={anni} onChange={(e) => setAnni(+(e.target as HTMLInputElement).value || 0)} /></label>
          <button class="primary" onClick={go} disabled={busy}>{busy ? "Working…" : "What should I farm?"}</button>
        </div>
        <p class="muted" style={{ marginTop: "8px" }}>Today's budget: <strong>{fmt(today)}</strong> sanity. The weekly Annihilation cap (1,800 Orundum) resets {dayTime(nextWeeklyReset(s))}.</p>
        {error && <p role="alert" class="bad-text">{error}</p>}
        <Explain>Demand: {lastPlan.value ? "your built plan" : "your Planner targets"} plus the community builds (E2, main skill M3, main module) of your 40 most-used operators the plan doesn't cover; if that's nearly paid for, everything players commonly build. Your depot pays all of it at once, crafting included.</Explain>
      </section>
      {result && (
        <>
          <section class="card">
            <h2>Today's runs</h2>
            {result.runs.length ? (
              <ul>{result.runs.map((r) => <li key={r.code}><strong>{r.code}</strong> × {r.runs} <span class="muted">({fmt(r.sanity)} sanity)</span></li>)}</ul>
            ) : <p>Nothing to farm with today's sanity{result.lacking.length ? "" : ": your depot covers what you're working toward"}.</p>}
            {result.farmed.length > 0 && <><p>Aimed at:</p><div class="items">{result.farmed.map((r) => <ItemIcon key={r.id} id={r.id} count={r.short || r.need} />)}</div></>}
            {result.days.filter((d) => d.offset > 0 && d.runs.length).length > 0 && (
              <details style={{ marginTop: "10px" }}><summary>The week ahead</summary>
                <ul>{result.days.filter((d) => d.offset > 0 && d.runs.length).map((d) => <li key={d.offset}>{WEEKDAYS[d.weekday - 1]}: {d.runs.map((r) => `${r.code} ×${r.runs}`).join(", ")}</li>)}</ul>
              </details>
            )}
          </section>
          <section class="card">
            <h2>Most lacking</h2>
            <p class="muted">Counted over {result.near ? (result.plan ? "your plan and " : "your targets and ") : ""}{result.counted} operators' builds{result.depth === "deep" ? " (everything players commonly build, since the main builds are nearly covered)" : ""}.</p>
            <div class="table-wrap">
              <table class="cards">
                <thead><tr><th>Material</th><th class="num">Held</th><th class="num">Needed</th><th class="num">Covered</th><th>For</th></tr></thead>
                <tbody>
                  {result.lacking.slice(0, 12).map((r) => (
                    <tr key={r.id}>
                      <td data-label="Material"><ItemIcon id={r.id} /></td>
                      <td data-label="Held" class="num">{fmt(r.held)}</td>
                      <td data-label="Needed" class="num">{fmt(r.need)}</td>
                      <td data-label="Covered" class="num">{pct(r.coverage, 0)}</td>
                      <td data-label="For">{r.near ? "plan / targets" : "community builds"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(result.lmd > 0 || result.exp > 0) && <p style={{ marginTop: "8px" }}>Also short: <Items cost={{ ...(result.lmd ? { [LMD]: result.lmd } : {}), ...(result.exp ? { [EXP]: result.exp } : {}) }} /> (CE and LS stages)</p>}
            <Explain>Ranked: your plan or targets first, then by how little of the need your depot covers, then by the sanity the shortfall is worth.</Explain>
          </section>
          {result.unlocks.length > 0 && (
            <section class="card">
              <h2>Left-out stages worth clearing</h2>
              <ul>{result.unlocks.map((u) => <li key={u.code}><strong>{u.code}</strong> would save about {fmt(u.saves)} sanity on what you're short of</li>)}</ul>
              <Explain>Stages you left out on the Farming page that the farming plan would use if they were back in.</Explain>
            </section>
          )}
        </>
      )}
    </>
  );
}
