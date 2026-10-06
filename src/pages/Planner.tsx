// Upgrade and material planner: target builds in, total materials / LMD / EXP and crafting out.
import { useEffect, useMemo, useState } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { OpPicker } from "../components/OpPicker";
import { Avatar, Await, Explain, ItemIcon, Items, itemsSig, metaSig, useAsync } from "../components/ui";
import { label, parse } from "../lib/build";
import { EXP, LMD, sanity, type Cost } from "../lib/costs";
import { breakdown, Stock } from "../lib/crafting";
import { operator, operators } from "../lib/data";
import { fmt } from "../lib/format";
import { decodeTargets, encodeTargets, findOp, planTarget, totalCost, type PlannedTarget } from "../lib/plan";
import { href, route, setQuery } from "../lib/router";
import { account, hasRoster, prefs, savePrefs, saveTargets, server, targets, type PlanTarget } from "../state";
import type { OpIndex } from "../types";

export default function Planner() {
  const s = server.value;
  const st = useAsync(() => operators(s), [s]);
  return (
    <div class="stack fade-in">
      <h1>Materials</h1>
      <Await state={st} what="operators">{(ops) => <PlannerView ops={ops} />}</Await>
    </div>
  );
}

function PlannerView({ ops }: { ops: OpIndex[] }) {
  const q = route.value.query;
  const shared = decodeTargets(q.get("t"));
  const list: PlanTarget[] = shared ?? targets.value;
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<OpIndex | null>(null);
  const [pendingText, setPendingText] = useState("E2 SL7 S3M3");

  useEffect(() => { // ?add=char_x from an operator page
    const addId = q.get("add");
    const op = addId && ops.find((o) => o.id === addId);
    if (op) { setPending(op); setQuery({ add: "" }); }
  }, [q.get("add")]);

  const commit = (next: PlanTarget[]) => {
    saveTargets(next);
    setQuery({ t: next.length ? encodeTargets(next) : "" });
  };

  const addLines = () => {
    const out: PlanTarget[] = [];
    for (const line of text.split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
      try {
        const { name, target } = parse(line);
        const op = findOp(name, ops);
        if (!op) throw new Error(`No operator called "${name || line}"`);
        out.push({ id: op.id, text: label(target) });
      } catch (e) {
        setErr((e as Error).message);
        return;
      }
    }
    setErr("");
    setText("");
    commit([...list, ...out]);
  };

  return (
    <>
      <section class="card">
        <h2>Add targets</h2>
        <div class="grid two">
          <div>
            <label class="field">
              <span>Type builds, one per line</span>
              <textarea value={text} placeholder={"Saria E2 L90, S2 M3, Mod X2\nTexas the Omertosa S2M3 ModX3\nMyrtle E1 L70 SL7"}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
            </label>
            <div class="row" style={{ marginTop: "8px" }}>
              <button class="primary" onClick={addLines} disabled={!text.trim()}>Add</button>
              {err && <span class="bad-text" role="alert">{err}</span>}
            </div>
            <Explain>Format: name, then any of E0-2, L1-90, SL1-7, S1-3 M1-3, Mod X/Y/A/D 1-3. Prerequisites come along: M3 brings E2 and SL7.</Explain>
          </div>
          <div>
            <OpPicker ops={ops} onPick={setPending} label="Or pick an operator" />
            {pending && (
              <div class="row" style={{ marginTop: "8px", alignItems: "flex-end" }}>
                <Avatar op={pending} size="sm" />
                <label class="field grow"><span>Target for {pending.name}</span>
                  <input type="text" value={pendingText} onInput={(e) => setPendingText((e.target as HTMLInputElement).value)} />
                </label>
                <button class="primary" onClick={() => {
                  try {
                    const { target } = parse(pendingText);
                    commit([...list, { id: pending.id, text: label(target) }]);
                    setPending(null);
                    setErr("");
                  } catch (e) { setErr((e as Error).message); }
                }}>Add</button>
              </div>
            )}
          </div>
        </div>
      </section>
      {shared && JSON.stringify(shared) !== JSON.stringify(targets.value) && (
        <p class="note">This is a shared plan. <button class="small" onClick={() => saveTargets(shared)}>Save it as my plan</button> (replaces yours).</p>
      )}
      {list.length > 0 && <Results list={list} ops={ops} onChange={commit} />}
    </>
  );
}

function Results({ list, ops, onChange }: { list: PlanTarget[]; ops: OpIndex[]; onChange: (t: PlanTarget[]) => void }) {
  const s = server.value;
  const details = useAsync(() => Promise.all(list.map((t) => operator(s, t.id).catch(() => null))), [s, list.map((t) => t.id).join()]);
  const meta = metaSig.value;
  const items = itemsSig.value;
  return (
    <Await state={details} what="operator details">
      {(ds) => {
        if (!meta || !items) return <p class="muted">Loading…</p>;
        const rows: PlannedTarget[] = list.map((t, i) => {
          const op = ops.find((o) => o.id === t.id);
          const d = ds[i];
          return op && d ? planTarget(t, op, d, meta, account.value.ops) : null;
        }).filter(Boolean) as PlannedTarget[];
        return <Totals rows={rows} list={list} onChange={onChange} />;
      }}
    </Await>
  );
}

function Totals({ rows, list, onChange }: { rows: PlannedTarget[]; list: PlanTarget[]; onChange: (t: PlanTarget[]) => void }) {
  const items = itemsSig.value!;
  const values = items.values;
  const total = totalCost(rows.filter((r) => !r.error));
  const useDepot = prefs.value.useDepot && Object.keys(account.value.depot).length > 0;
  const crafting = useMemo(() => {
    const craftable = (id: string) => (items.items[id]?.group === "material" && items.items[id].rarity >= 4) || items.items[id]?.group === "chip";
    const mats = Object.fromEntries(Object.entries(total).filter(([k]) => k !== LMD && k !== EXP));
    const tree = breakdown(mats, items.recipes, craftable);
    let depot: { short: Cost; crafted: Record<string, number> } | null = null;
    if (useDepot) {
      const stock = new Stock(account.value.depot, items.recipes);
      const short: Cost = {};
      // pay item by item so one missing material doesn't hide what the depot does cover
      for (const [id, n] of Object.entries(total)) Object.assign(short, stock.pay({ [id]: n }));
      depot = { short, crafted: stock.crafted };
    }
    return { tree, depot };
  }, [JSON.stringify(total), useDepot, account.value.depot]);
  const shortItems = crafting.depot ? crafting.depot.short : total;
  const farmLink = href("/farming", { items: Object.entries(shortItems).filter(([k]) => k !== LMD && k !== EXP).map(([k, n]) => `${k}:${n}`).join(",") });
  return (
    <>
      <section class="card">
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Targets ({rows.length})</h2>
          <div class="row">
            <button class="small ghost" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
            <button class="small ghost" onClick={() => onChange([])}>Remove all</button>
          </div>
        </div>
        <div class="table-wrap" style={{ marginTop: "10px" }}>
          <table class="cards">
            <thead><tr><th>Operator</th><th>From</th><th>To</th><th>Cost</th><th class="num">Sanity value</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.op.id}${i}`}>
                  <td data-label="Operator"><a class="op-cell" href={href(`/operator/${r.op.id}`)}><Avatar op={r.op} size="sm" /><span class="op-name">{r.op.name}</span></a></td>
                  <td data-label="From">{account.value.ops[r.op.id] ? <BuildMarks s={r.from} op={r.op} /> : <span class="muted">new copy</span>}</td>
                  <td data-label="To">{r.error ? <span class="bad-text">{r.error}</span> : r.done ? <span class="good-text">Already there</span> : <BuildMarks s={r.to!} op={r.op} />}
                    <br /><small class="muted">asked: {r.t.text}</small></td>
                  <td data-label="Cost"><Items cost={r.cost} empty="–" /></td>
                  <td data-label="Sanity value" class="num">{fmt(sanity(r.cost, values))}</td>
                  <td data-label=""><button class="small ghost" aria-label={`Remove ${r.op.name}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div class="grid two">
        <section class="card">
          <h2>Total</h2>
          <dl class="kv" style={{ marginBottom: "10px" }}>
            <dt>LMD</dt><dd>{fmt(total[LMD] || 0)}</dd>
            <dt>EXP</dt><dd>{fmt(total[EXP] || 0)} <small class="muted">≈ {fmt(Math.ceil((total[EXP] || 0) / 2000))} Strategic Battle Records</small></dd>
            <dt>Sanity value <span class="badge est">estimate</span></dt><dd><strong>{fmt(sanity(total, values))}</strong></dd>
          </dl>
          <Items cost={Object.fromEntries(Object.entries(total).filter(([k]) => k !== LMD && k !== EXP))} />
          <Explain>Sanity value: every material priced at what it costs to farm (Yituliu's values, corrected for this server's drop rates), LMD and EXP included.</Explain>
        </section>
        <section class="card">
          <h2>Crafting</h2>
          {Object.keys(crafting.tree.crafts).length ? (
            <>
              <p>Craft these in the Workshop (Dualchips in a Factory):</p>
              <div class="items">{Object.entries(crafting.tree.crafts).map(([id, n]) => <ItemIcon key={id} id={id} count={n} title={`${n} crafts of ${items.items[id]?.name}`} />)}</div>
              <p style={{ marginTop: "10px" }}>From these lower-tier materials:</p>
              <Items cost={Object.fromEntries(Object.entries(crafting.tree.base).filter(([k]) => k !== LMD))} />
              <p class="muted" style={{ marginTop: "6px" }}>Crafting LMD: {fmt(crafting.tree.base[LMD] || 0)}</p>
            </>
          ) : <p class="muted">Nothing to craft: every material is farmed directly.</p>}
          <Explain>T4/T5 materials and Dualchips broken down into what they're made of, ignoring Workshop byproducts. Counts are crafts, not items.</Explain>
        </section>
      </div>
      <section class="card">
        <h2>Against your depot</h2>
        {!hasRoster.value && !Object.keys(account.value.depot).length ? (
          <p class="muted">Enter your depot under <a href={href("/roster", { tab: "depot" })}>My account → Depot</a> (or import it) to see what you can already pay for.</p>
        ) : (
          <>
            <label class="row"><input type="checkbox" checked={prefs.value.useDepot} onChange={(e) => savePrefs({ ...prefs.value, useDepot: (e.target as HTMLInputElement).checked })} /> Use my depot (crafting what it can)</label>
            {crafting.depot && (
              Object.keys(crafting.depot.short).length
                ? <><p style={{ marginTop: "8px" }}>Still short:</p><Items cost={crafting.depot.short} /></>
                : <p class="good-text" style={{ marginTop: "8px" }}>Your depot covers all of it.</p>
            )}
            {crafting.depot && Object.keys(crafting.depot.crafted).length > 0 && (
              <><p style={{ marginTop: "8px" }}>Crafted from your depot along the way:</p>
                <div class="items">{Object.entries(crafting.depot.crafted).map(([id, n]) => <ItemIcon key={id} id={id} count={n} />)}</div></>
            )}
          </>
        )}
        <p style={{ marginTop: "10px" }}><a class="btn primary" href={farmLink}>Plan the farming for what's missing</a></p>
      </section>
    </>
  );
}
