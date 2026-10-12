// The roster's Progress tab: daily snapshots charted, and what changed since an earlier day with what it cost.
import { useMemo, useState } from "preact/hooks";
import { Chart } from "../../components/Chart";
import { Await, Divider, Explain, Items, itemsSig, metaSig, OpLink, useAsync } from "../../components/ui";
import { costTable } from "../../lib/account";
import { EXP, LMD, sanity } from "../../lib/costs";
import { diff, type Change } from "../../lib/progress";
import { date, fmt } from "../../lib/format";
import { account, server } from "../../state";
import type { OpIndex } from "../../types";

export function Progress({ ops }: { ops: OpIndex[] }) {
  const snaps = account.value.snapshots;
  if (snaps.length < 1) return <p class="muted">Progress is recorded once a day whenever you edit or import your roster.</p>;
  const series: [keyof (typeof snaps)[0], string][] = [["ops", "Operators"], ["e2", "E2"], ["m3", "M3 skills"], ["mods", "Modules"]];
  return (
    <div class="grid two">
      <Divider />
      <Changes ops={ops} />
      {series.map(([k, label]) => <Chart key={k} label={label} points={snaps.map((s) => [s.t, s[k] as number])} />)}
      <section class="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Snapshots</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th class="num">Operators</th><th class="num">E2</th><th class="num">M3</th><th class="num">Modules</th></tr></thead>
            <tbody>{[...snaps].reverse().map((s) => <tr key={s.t}><td>{date(s.t)}</td><td class="num">{s.ops}</td><td class="num">{s.e2}</td><td class="num">{s.m3}</td><td class="num">{s.mods}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const KIND_LABEL: Record<Change["kind"], string> = { new: "Joined", growth: "Promotion and levels", skill: "Skill level", mastery: "Mastery", module: "Module", potential: "Potential" };

/** What changed since an earlier snapshot, and exactly what it cost. */
function Changes({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const today = new Date().toDateString();
  const earlier = account.value.snapshots.filter((x) => x.roster && new Date(x.t).toDateString() !== today);
  const [since, setSince] = useState<number | null>(null);
  const costs = useAsync(() => costTable(s), [s]);
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const meta = metaSig.value, items = itemsSig.value;
  if (!earlier.length) {
    return <section class="card" style={{ gridColumn: "1 / -1" }}><h2>What changed</h2><p class="muted">From tomorrow, this shows what you raised since an earlier day and exactly what it cost: Novena keeps a full copy of your roster once a day (the last 60 days) whenever you edit, import or sync it.</p></section>;
  }
  const base = earlier.find((x) => x.t === since) || earlier[earlier.length - 1];
  return (
    <section class="card" style={{ gridColumn: "1 / -1" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>What changed</h2>
        <label class="field"><span>Since</span>
          <select value={base.t} onChange={(e) => setSince(Number((e.target as HTMLSelectElement).value))}>
            {[...earlier].reverse().map((x) => <option key={x.t} value={x.t}>{date(x.t)}</option>)}
          </select>
        </label>
      </div>
      <Await state={costs} what="upgrade costs">
        {(table) => {
          if (!meta || !items) return <p class="muted">Loading…</p>;
          const p = diff({ roster: base.roster!, depot: base.depot || {} }, { roster: account.value.ops, depot: account.value.depot }, table, meta.const, byId);
          if (!p.changes.length) return <p class="muted" style={{ marginTop: "8px" }}>Nothing raised since then.</p>;
          const byOp = new Map<string, Change[]>();
          p.changes.forEach((c) => byOp.set(c.id, [...(byOp.get(c.id) || []), c]));
          const lmd = p.spent[LMD] || 0, exp = p.spent[EXP] || 0;
          return (
            <>
              <div class="statgrid" style={{ margin: "10px 0" }}>
                <div class="stat"><div class="k">Operators raised</div><div class="v">{byOp.size}</div></div>
                <div class="stat"><div class="k">LMD spent</div><div class="v">{fmt(lmd)}</div></div>
                <div class="stat"><div class="k">EXP spent</div><div class="v">{fmt(exp)}</div></div>
                <div class="stat"><div class="k">Worth in sanity</div><div class="v">{fmt(sanity(p.spent, items.values))}</div></div>
              </div>
              <div class="table-wrap">
                <table class="cards">
                  <thead><tr><th>Operator</th><th>Change</th><th>Cost</th></tr></thead>
                  <tbody>
                    {[...byOp.entries()].map(([id, list]) => list.map((c, i) => (
                      <tr key={id + i}>
                        <td data-label="Operator">{i === 0 && byId.get(id) ? <OpLink op={byId.get(id)!} /> : null}</td>
                        <td data-label="Change">{KIND_LABEL[c.kind]}: {c.before} → {c.after}</td>
                        <td data-label="Cost"><Items cost={c.cost} empty="–" /></td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ marginTop: "14px" }}>Materials spent</h3>
              <Items cost={Object.fromEntries(Object.entries(p.spent).filter(([k]) => k !== LMD && k !== EXP))} />
            </>
          );
        }}
      </Await>
      <Explain>Priced with the game's own costs: levels to the cap before each promotion, skill levels, masteries and modules. Alternate forms share their base form's promotion and levels, so those count once.</Explain>
    </section>
  );
}
