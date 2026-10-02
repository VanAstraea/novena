// Plan: the upgrades that unlock the most followable community clears per sanity, goals first, with a
// "doable now" depot check counted all together.
import { useState } from "preact/hooks";
import { Avatar, Await, Explain, Items, itemsSig, metaSig, useAsync } from "../components/ui";
import { costTable, goalStates, guidebook, lastPlan, rosterStates, runPlan } from "../lib/account";
import { stateLabel } from "../lib/build";
import { EXP, LMD } from "../lib/costs";
import { Stock } from "../lib/crafting";
import { operators, usage as loadUsage } from "../lib/data";
import { fmt, pct } from "../lib/format";
import { SUPPORT_SLOTS, totalOf, type PlanResult, type PlanStep } from "../lib/planner";
import { href } from "../lib/router";
import { account, hasRoster, server, targets } from "../state";
import type { OpIndex } from "../types";


export default function Plan() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage()]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Plan: what to build next</h1>
      {!hasRoster.value ? (
        <div class="card"><p>The plan scores your roster against community clear guides, so it needs your roster first. <a href={href("/roster")}>Add it under My roster</a>.</p></div>
      ) : (
        <Await state={st} what="operators">{([ops]) => <PlanView ops={new Map(ops.map((o) => [o.id, o]))} />}</Await>
      )}
    </div>
  );
}

function PlanView({ ops }: { ops: Map<string, OpIndex> }) {
  const s = server.value;
  const [top, setTop] = useState(20);
  const [support, setSupport] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const key = JSON.stringify([s, account.value.ops, targets.value, top, support]);
  const plan = lastPlan.value?.key === key ? lastPlan.value.result : null;
  const items = itemsSig.value;
  const meta = metaSig.value;

  const build = async () => {
    if (!items || !meta) return;
    setError("");
    setProgress("Loading the guidebook");
    try {
      const [book, costs, opsList] = await Promise.all([guidebook(), costTable(s), operators(s)]);
      const states = rosterStates(account.value, costs);
      const result = await runPlan({
        book, costs, constTable: meta.const, values: items.values, roster: states,
        available: opsList.filter((o) => o.on.includes(s)).map((o) => o.id),
        shared: opsList.filter((o) => o.patch).map((o) => o.id),
        fixed: opsList.filter((o) => o.obtain === "is").map((o) => o.id),
        weights: { main: 0.25, event: 0.35, annihilation: 0.1, cc: 0.2, supply: 0.05, other: 0.05 },
        top, support: support ? SUPPORT_SLOTS : 0, goals: goalStates(targets.value, states, costs, ops),
      }, (phase, done, total) => setProgress(total > 1 ? `${phase} (${done}/${total})` : phase));
      lastPlan.value = { key, result };
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Steps</span>
            <select value={top} onChange={(e) => setTop(+(e.target as HTMLSelectElement).value)}>{[10, 20, 40].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label class="row tight"><input type="checkbox" checked={support} onChange={(e) => setSupport((e.target as HTMLInputElement).checked)} /> Count on borrowing one support operator</label>
          <button class="primary" onClick={build} disabled={!!progress || !items || !meta}>{progress ? "Working…" : plan ? "Rebuild plan" : "Build my plan"}</button>
        </div>
        {progress && <p role="status" class="muted" style={{ marginTop: "8px" }}>{progress}…</p>}
        {error && <p role="alert" class="bad-text">{error}</p>}
        <Explain>Each upgrade is scored by how many more community clear guides (MAA Copilot) your roster could follow, per sanity it costs. Unstated parts of a guide's usual build (E2, M3, module) count as soft: missing M3 on a skill 98% of owners mastered leaves a 2% chance. Your Planner targets are applied first as goals. Runs in your browser; the first run downloads the guidebook (a few MB).</Explain>
      </section>
      {plan && <Result plan={plan} ops={ops} />}
    </>
  );
}

function Result({ plan, ops }: { plan: PlanResult; ops: Map<string, OpIndex> }) {
  const items = itemsSig.value!;
  const all = [...plan.goals, ...plan.steps];
  // "doable now": the whole plan paid at once from the depot, crafting included, counted together
  const stock = new Stock(account.value.depot, items.recipes);
  let ready = 0;
  const readyFlags = all.map((st) => {
    const short = stock.pay(st.cost);
    const ok = !Object.keys(short).length;
    if (ok) ready++;
    return { ok, short };
  });
  const together = new Stock(account.value.depot, items.recipes);
  const shortAll: Record<string, number> = {};
  for (const [id, n] of Object.entries(totalOf(all))) Object.assign(shortAll, together.pay({ [id]: n }));
  return (
    <>
      <div class="grid three">
        <div class="card"><div class="muted">Coverage now</div><div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{pct(plan.startValue)}</div><small class="muted">{plan.startStages.toFixed(0)} of {plan.totalStages} guided stages clearable</small></div>
        {plan.goalValue !== null && <div class="card"><div class="muted">With your goals</div><div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{pct(plan.goalValue)}</div></div>}
        <div class="card"><div class="muted">After the plan</div><div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{pct(plan.endValue)}</div><small class="muted">{fmt(totalSanity(all))} sanity of upgrades</small></div>
      </div>
      <section class="card">
        <h2>Steps</h2>
        <div class="table-wrap">
          <table class="cards">
            <thead><tr><th>#</th><th>Operator</th><th>Upgrade</th><th class="num">Coverage</th><th class="num">Sanity</th><th>Cost</th><th>Depot</th></tr></thead>
            <tbody>
              {all.map((st, i) => <StepRow key={i} st={st} i={i} goal={i < plan.goals.length} op={ops.get(st.id)} ready={readyFlags[i]} />)}
            </tbody>
          </table>
        </div>
        <Explain>Coverage: how much the step raises the share of guided stages your roster could clear (half "at least one guide works", half "share of guides that work"), weighted across content. Depot: whether the depot pays for the step after the steps above it, crafting included.</Explain>
      </section>
      <section class="card">
        <h2>Doable now</h2>
        <p>{ready} of {all.length} steps can be paid from your depot in order.{" "}
          {Object.keys(account.value.depot).length === 0 && <span class="muted">(Your depot is empty: <a href={href("/roster", { tab: "depot" })}>enter it</a>.)</span>}</p>
        {Object.keys(shortAll).length ? (
          <>
            <p>Counted all together, the whole plan is short of:</p>
            <Items cost={shortAll} />
            <p style={{ marginTop: "8px" }}><a class="btn primary" href={href("/farming", { items: Object.entries(shortAll).filter(([k]) => k !== LMD && k !== EXP).map(([k, n]) => `${k}:${n}`).join(",") })}>Plan the farming for it</a></p>
          </>
        ) : <p class="good-text">Your depot covers the whole plan.</p>}
        <Explain>"All together" pays every step from one depot at once, so steps that each look affordable can't all claim the same materials.</Explain>
      </section>
    </>
  );
}

const totalSanity = (steps: PlanStep[]) => steps.reduce((s, x) => s + x.sanity, 0);

function describe(st: PlanStep): string {
  const b = st.before, a = st.after;
  const parts: string[] = [];
  if (a.elite !== b.elite || a.level !== b.level) parts.push(`E${a.elite} L${a.level}`);
  if (a.skillLevel !== b.skillLevel) parts.push(`SL${a.skillLevel}`);
  a.masteries.forEach((m, i) => { if (m !== b.masteries[i]) parts.push(`S${i + 1} M${m}`); });
  for (const [k, v] of Object.entries(a.modules)) if (v !== (b.modules[k] || 0)) parts.push(`Mod ${k}${v}`);
  return parts.join(", ") || stateLabel(a);
}

function StepRow({ st, i, goal, op, ready }: { st: PlanStep; i: number; goal: boolean; op?: OpIndex; ready: { ok: boolean; short: Record<string, number> } }) {
  return (
    <tr>
      <td data-label="#">{goal ? <span class="badge">goal</span> : i + 1}</td>
      <td data-label="Operator">{op ? <a class="op-cell" href={href(`/operator/${op.id}`)}><Avatar op={op} size="sm" /><span class="op-name">{op.name}</span></a> : st.id}</td>
      <td data-label="Upgrade">{describe(st)}{st.stageGains.length > 0 && <><br /><small class="muted">helps on {st.stageGains.length} stage{st.stageGains.length > 1 ? "s" : ""}</small></>}</td>
      <td data-label="Coverage" class="num">+{(st.gain * 100).toFixed(2)}%</td>
      <td data-label="Sanity" class="num">{fmt(st.sanity)}</td>
      <td data-label="Cost"><Items cost={st.cost} /></td>
      <td data-label="Depot">{ready.ok ? <span class="good-text">✓ covered</span> : <span class="warn-text">short {Object.keys(ready.short).length} item{Object.keys(ready.short).length > 1 ? "s" : ""}</span>}</td>
    </tr>
  );
}
