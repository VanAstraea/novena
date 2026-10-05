// Priorities: the upgrades that unlock the most followable community clears per sanity, goals first, with a
// "doable now" depot check counted all together. It builds by itself (lib/priorities.ts); the button rebuilds.
import { useEffect } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { toast } from "../components/Toast";
import { parse } from "../lib/build";
import { WeightsControl } from "../components/Weights";
import { Avatar, Await, Explain, Items, itemsSig, metaSig, useAsync } from "../components/ui";
import { lastPlan } from "../lib/account";
import { autoPriorities, buildPriorities, freshPriorities, prioError, prioStatus, prioSupport, prioTop, setPrioSettings } from "../lib/priorities";
import { EXP, LMD } from "../lib/costs";
import { Stock } from "../lib/crafting";
import { operators, usage as loadUsage } from "../lib/data";
import { fmt, pct } from "../lib/format";
import { totalOf, type PlanResult, type PlanStep } from "../lib/planner";
import { href } from "../lib/router";
import { account, hasRoster, saveTargets, server, targets } from "../state";
import type { OpIndex } from "../types";


export default function Plan() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage()]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Priorities</h1>
      <p class="muted" style={{ marginTop: "-6px" }}>What to raise next across your whole roster, for the content you play.</p>
      {!hasRoster.value ? (
        <div class="card"><p>Priorities score your roster against community clear guides, so they need your roster first. <a href={href("/roster", { tab: "import" })}>Add it under My roster</a>.</p></div>
      ) : (
        <Await state={st} what="operators">{([ops]) => <PlanView ops={new Map(ops.map((o) => [o.id, o]))} />}</Await>
      )}
    </div>
  );
}

function PlanView({ ops }: { ops: Map<string, OpIndex> }) {
  useEffect(() => { void autoPriorities(); }, [account.value.ops, targets.value, prioTop.value, prioSupport.value]);
  const fresh = freshPriorities();
  const plan = fresh || lastPlan.value?.result || null; // an older result stays on screen while the new one builds
  const progress = prioStatus.value, error = prioError.value;
  const top = prioTop.value, support = prioSupport.value;
  const items = itemsSig.value, meta = metaSig.value;
  const build = () => void buildPriorities();

  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Steps</span>
            <select value={top} onChange={(e) => setPrioSettings(+(e.target as HTMLSelectElement).value, support)}>{[10, 20, 40].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label class="row tight"><input type="checkbox" checked={support} onChange={(e) => setPrioSettings(top, (e.target as HTMLInputElement).checked)} /> Count on borrowing one support operator</label>
          <button class="primary" onClick={build} disabled={!!progress || !items || !meta}>{progress ? "Working…" : "Rebuild"}</button>
        </div>
        <WeightsControl compact />
        {progress && <p role="status" class="muted" style={{ marginTop: "8px" }}>{plan ? "Updating for your latest roster: " : ""}{progress}…</p>}
        {error && <p role="alert" class="bad-text">{error}</p>}
        <Explain>Each upgrade is scored by how many more community clear guides (MAA Copilot) your roster could follow, per sanity it costs. Unstated parts of a guide's usual build (E2, M3, module) count as soft: missing M3 on a skill 98% of owners mastered leaves a 2% chance. Your Planner targets are applied first as goals. Runs in your browser by itself after an import or sync and whenever your roster has changed; the first run downloads the guidebook (a few MB).</Explain>
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


function StepRow({ st, i, goal, op, ready }: { st: PlanStep; i: number; goal: boolean; op?: OpIndex; ready: { ok: boolean; short: Record<string, number> } }) {
  return (
    <tr>
      <td data-label="#">{goal ? <span class="badge">goal</span> : i + 1}</td>
      <td data-label="Operator">{op ? <a class="op-cell" href={href(`/operator/${op.id}`)}><Avatar op={op} size="sm" /><span class="op-name">{op.name}</span></a> : st.id}</td>
      <td data-label="Upgrade"><BuildMarks s={st.after} from={st.before} op={op} />{st.stageGains.length > 0 && <><br /><small class="muted">helps on {st.stageGains.length} stage{st.stageGains.length > 1 ? "s" : ""}</small></>}</td>
      <td data-label="Coverage" class="num">+{(st.gain * 100).toFixed(2)}%</td>
      <td data-label="Sanity" class="num">{fmt(st.sanity)}</td>
      <td data-label="Cost"><Items cost={st.cost} /></td>
      <td data-label="Depot">
        {ready.ok ? <span class="good-text">✓ covered</span> : <span class="warn-text">short {Object.keys(ready.short).length} item{Object.keys(ready.short).length > 1 ? "s" : ""}</span>}
        <div class="step-actions">
          {!goal && op && <button class="small" onClick={() => makeGoal(st, op)}>Make it a goal</button>}
          {!ready.ok && farmable(ready.short) && <a class="btn small" href={href("/farming", { items: farmable(ready.short) })}>Farm what's short</a>}
        </div>
      </td>
    </tr>
  );
}

/** What's short, as the Farming planner's item list (LMD and EXP come from their own stages). */
const farmable = (short: Record<string, number>) => Object.entries(short).filter(([k]) => k !== LMD && k !== EXP).map(([k, n]) => `${k}:${n}`).join(",");

/** A step as Planner goal text ("E2 L90, SL7, S2 M3, Mod X2"), added to the operator's goal if there is one. */
function makeGoal(st: PlanStep, op: OpIndex) {
  const b = st.before, a = st.after, parts: string[] = [];
  if (a.elite !== b.elite || a.level !== b.level) parts.push(`E${a.elite} L${a.level}`);
  if (a.skillLevel !== b.skillLevel) parts.push(`SL${a.skillLevel}`);
  a.masteries.forEach((m, i) => { if (m !== b.masteries[i]) parts.push(`S${i + 1} M${m}`); });
  for (const [k, v] of Object.entries(a.modules)) if (v !== (b.modules[k] || 0)) parts.push(`Mod ${k}${v}`);
  const step = parts.join(", ");
  if (!step) return;
  const had = targets.value.find((t) => t.id === op.id);
  const text = had ? `${had.text}, ${step}` : step;
  try { parse(`${op.name} ${text}`); } catch (e) { toast((e as Error).message, { kind: "bad" }); return; }
  saveTargets([...targets.value.filter((t) => t.id !== op.id), { id: op.id, text }]);
  toast(`${op.name}: ${step} is a goal now.`, { link: { href: href("/planner"), label: "Open the planner" } });
}
