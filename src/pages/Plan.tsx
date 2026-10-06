// Priorities: the upgrades that unlock the most followable community clears per sanity, goals first, with a
// "doable now" depot check counted all together. It builds by itself (lib/priorities.ts); the button rebuilds.
import { useEffect, useState } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { toast, undoable } from "../components/Toast";
import { parse } from "../lib/build";
import { WeightsControl } from "../components/Weights";
import { Avatar, Await, Explain, GIcon, Items, itemsSig, metaSig, useAsync } from "../components/ui";
import { lastPlan } from "../lib/account";
import { autoPriorities, buildPriorities, filtersOn, freshPriorities, leaveOut, mayRaise, NO_FILTERS, prioError, prioFilters, prioStatus, prioSupport, prioTop, setPrioFilters, setPrioSettings, TIERS, type PrioFilters } from "../lib/priorities";
import { OpPicker } from "../components/OpPicker";
import { art } from "../lib/data";
import { CLASS_NAMES } from "../lib/format";
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
  useEffect(() => { void autoPriorities(); }, [account.value.ops, targets.value, prioTop.value, prioSupport.value, prioFilters.value]);
  const fresh = freshPriorities();
  const plan = fresh || lastPlan.value?.result || null; // an older result stays on screen while the new one builds
  const progress = prioStatus.value, error = prioError.value;
  const top = prioTop.value, support = prioSupport.value;
  const items = itemsSig.value, meta = metaSig.value;
  const build = () => void buildPriorities();
  const [showFilters, setShowFilters] = useState(() => filtersOn());
  const openFilters = () => { setShowFilters(true); requestAnimationFrame(() => document.getElementById("prio-filters")?.scrollIntoView({ behavior: "smooth", block: "center" })); };

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
        <FiltersControl ops={ops} open={showFilters} setOpen={setShowFilters} />
        {progress && <p role="status" class="muted" style={{ marginTop: "8px" }}>{plan ? "Updating the priorities (the list below is the previous one): " : ""}{progress}…</p>}
        {error && <p role="alert" class="bad-text">{error}</p>}
        <Explain>Each upgrade is scored by how many more community clear guides (MAA Copilot) your roster could follow, per sanity it costs. Unstated parts of a guide's usual build (E2, M3, module) count as soft: missing M3 on a skill 98% of owners mastered leaves a 2% chance. Your Planner targets are applied first as goals. Runs in your browser by itself after an import or sync and whenever your roster has changed; the first run downloads the guidebook (about half a MB).</Explain>
      </section>
      {plan && <Result plan={plan} ops={ops} openFilters={openFilters} />}
    </>
  );
}

function Result({ plan, ops, openFilters }: { plan: PlanResult; ops: Map<string, OpIndex>; openFilters: () => void }) {
  const items = itemsSig.value!;
  // operators just left out drop off straight away; the rebuild fills the list back up
  const steps = plan.steps.filter((st) => { const op = ops.get(st.id); return !op || mayRaise(op); });
  const all = [...plan.goals, ...steps];
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopPicking = () => { setPicking(false); setPicked(new Set()); };
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
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2>Steps</h2>
          {!picking && steps.length > 0 && <button class="small ghost" onClick={() => setPicking(true)}>Leave out several…</button>}
        </div>
        <LeftOut ops={ops} change={openFilters} />
        {picking && (
          <div class="bulk-bar" role="group" aria-label="Leave out the selected operators">
            <strong>{picked.size ? `${picked.size} selected` : "Tick the operators to leave out"}</strong>
            <button class="small primary" disabled={!picked.size} onClick={() => { leaveOut([...picked].map((id) => ({ id, name: ops.get(id)?.name || id }))); stopPicking(); }}>Leave out the selected ({picked.size})</button>
            <button class="small ghost" onClick={stopPicking}>Cancel</button>
          </div>
        )}
        <div class="table-wrap">
          <table class="cards">
            <thead><tr>{picking && <th class="pick"><span class="sr-only">Select</span></th>}<th>#</th><th>Operator</th><th>Upgrade</th><th class="num">Coverage</th><th class="num">Sanity</th><th>Cost</th><th>Depot</th></tr></thead>
            <tbody>
              {all.map((st, i) => <StepRow key={i} st={st} i={i} goal={i < plan.goals.length} op={ops.get(st.id)} ready={readyFlags[i]} pick={picking ? { on: picked.has(st.id), toggle: () => pick(st.id) } : undefined} />)}
            </tbody>
          </table>
        </div>
        <Explain>Coverage: how much the step raises the share of guided stages your roster could clear (half "at least one guide works", half "share of guides that work"), weighted across content. Depot: whether the depot pays for the step after the steps above it, crafting included. Leave out: stop suggesting that operator (bring them back under What to suggest).</Explain>
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


/** Who is left out, above the steps, so a short list doesn't look like a broken one. */
function LeftOut({ ops, change }: { ops: Map<string, OpIndex>; change: () => void }) {
  const f = prioFilters.value;
  if (!f.skip.length && !f.skipRarity.length) return null;
  const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  const who = f.skip.length > 3 ? `${f.skip.length} operators` : f.skip.length ? and(f.skip.map((id) => ops.get(id)?.name || id)) : "";
  const tiers = TIERS.filter((t) => f.skipRarity.includes(t)).map((t) => (t === 3 ? "1–3★" : `${t}★`));
  const every = tiers.length ? `every ${and(tiers)} operator` : "";
  return <p class="muted" style={{ margin: "0 0 8px" }}>Leaving out {who && every ? `${who}, plus ${every}` : who || every} · <button class="linkish" onClick={change}>Change</button></p>;
}

function StepRow({ st, i, goal, op, ready, pick }: { st: PlanStep; i: number; goal: boolean; op?: OpIndex; ready: { ok: boolean; short: Record<string, number> }; pick?: { on: boolean; toggle: () => void } }) {
  return (
    <tr class={pick?.on ? "picked" : undefined}>
      {pick && <td data-label={goal || !op ? "" : "Select"} class="pick">{!goal && op && <input type="checkbox" aria-label={`Select ${op.name}`} checked={pick.on} onChange={pick.toggle} />}</td>}
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
          {!goal && op && <button class="small ghost" onClick={() => leaveOut([op])} title="Stop suggesting this operator">Leave out</button>}
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

const RARITIES: [number, string][] = [[6, "6★"], [5, "5★"], [4, "4★"], [3, "3★ and below"]];
const KINDS: [keyof PrioFilters["kinds"], string][] = [["promote", "Promotion and levels"], ["skill", "Skill levels"], ["mastery", "Masteries"], ["module", "Modules"]];
const CAPS = [0, 500, 1000, 2000, 5000];

/** "What to suggest": rarities and classes, kinds of upgrade, a sanity cap per step, operators left out. The plan
 *  rebuilds when they change; Today, Home, the Sanity Dump and the event shops follow it. */
function FiltersControl({ ops, open, setOpen }: { ops: Map<string, OpIndex>; open: boolean; setOpen: (open: boolean) => void }) {
  const f = prioFilters.value;
  const set = (patch: Partial<PrioFilters>) => setPrioFilters({ ...prioFilters.value, ...patch });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const owned = Object.keys(account.value.ops).map((id) => ops.get(id)).filter((o): o is OpIndex => !!o);
  const classes = [...new Set(owned.map((o) => o.cls))].sort();
  return (
    <details id="prio-filters" class="weights" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>What to suggest{filtersOn(f) ? " (filtered)" : ""}</summary>
      <div class="filters">
        <div class="filter-row"><span class="weights-label">Rarity</span>
          <div class="chips">{RARITIES.map(([r, label]) => <button key={r} class="chip" aria-pressed={!f.skipRarity.includes(r)} onClick={() => set({ skipRarity: toggle(f.skipRarity, r) })}>{label}</button>)}</div></div>
        <div class="filter-row"><span class="weights-label">Class</span>
          <div class="chips">{classes.map((c) => <button key={c} class="chip cls-chip" aria-pressed={f.cls.includes(c)} onClick={() => set({ cls: toggle(f.cls, c) })}><GIcon src={art.classIcon(c)} alt="" size={16} />{CLASS_NAMES[c] || c}</button>)}</div></div>
        <div class="filter-row"><span class="weights-label">Upgrades</span>
          <div class="chips">{KINDS.map(([k, label]) => <button key={k} class="chip" aria-pressed={f.kinds[k]} onClick={() => set({ kinds: { ...f.kinds, [k]: !f.kinds[k] } })}>{label}</button>)}</div></div>
        <div class="filter-row"><span class="weights-label">Cost per step</span>
          <select value={f.maxSanity} onChange={(e) => set({ maxSanity: +(e.target as HTMLSelectElement).value })}>
            {CAPS.map((c) => <option key={c} value={c}>{c ? `Up to ${fmt(c)} sanity` : "Any"}</option>)}
          </select></div>
        <div class="filter-row"><span class="weights-label">Leave out</span>
          <div class="chips">
            {f.skip.map((id) => { const name = ops.get(id)?.name || id; return <button key={id} class="chip" onClick={() => set({ skip: prioFilters.value.skip.filter((x) => x !== id) })} title="Suggest again" aria-label={`Suggest ${name} again`}>{name} <span aria-hidden="true">✕</span></button>; })}
            {f.skip.length > 1 && <button class="small ghost" onClick={() => { const was = f.skip; set({ skip: [] }); undoable("Everyone left out is suggested again.", () => set({ skip: was })); }}>Suggest all again</button>}
            <OpPicker ops={owned} exclude={f.skip} label="" placeholder={f.skip.length ? "Another operator…" : "Operators to leave out…"} again onPick={(o) => set({ skip: [...prioFilters.value.skip, o.id] })} />
          </div></div>
        {filtersOn(f) && <button class="small ghost" onClick={() => { setPrioFilters(NO_FILTERS); undoable("Filters cleared.", () => setPrioFilters(f)); }}>Clear the filters</button>}
      </div>
      <p class="explain">Rarity and Upgrades: switch one off to stop suggesting it (3★ and below takes in 1★ and 2★). Class: pick some to suggest only those. Your Planner goals are always included. Today, Home, the Sanity Dump and the event shops follow these.</p>
    </details>
  );
}
