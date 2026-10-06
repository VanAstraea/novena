// Usage rankings from community clears, per content type and archetype. (The roster's archetype gaps are their own page.)
import { useEffect, useMemo, useState } from "preact/hooks";
import { CommunityMarks } from "../components/Marks";
import { OpFilters, useOpFilters } from "../components/OpFilters";
import { WeightsControl } from "../components/Weights";
import { contentLevels, customised, weightedScore } from "../lib/weights";
import { Await, Explain, metaSig, OpLink, SortTh, Stars, Tabs, useAsync } from "../components/ui";
import { operators, usage as loadUsage } from "../lib/data";
import { CATEGORY_NAMES, CLASS_NAMES, CLASS_ORDER, pct } from "../lib/format";
import { href, navigate, route, setQuery } from "../lib/router";
import { account, hasRoster, server } from "../state";
import type { Category, OpIndex, UsageFile } from "../types";

type View = "operators" | "archetypes";
const CATS: (Category | "all")[] = ["all", "main", "event", "annihilation", "cc"];

export default function Rankings() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage()]), [s]);
  const view = (route.value.query.get("view") || "operators") as View | "gaps";
  useEffect(() => { if (view === "gaps") navigate(href("/gaps"), { replace: true }); }, [view]); // old links
  return (
    <div class="stack fade-in">
      <h1>Rankings</h1>
      <Tabs label="Ranking views" value={view} onChange={(v) => setQuery({ view: v === "operators" ? "" : v })}
        tabs={[{ key: "operators", label: "Operators" }, { key: "archetypes", label: "Archetypes" }]} />
      <Await state={st} what="usage data">
        {([ops, usage]) => view === "archetypes" ? <Archetypes ops={ops} usage={usage} /> : <Ops ops={ops} usage={usage} />}
      </Await>
    </div>
  );
}

function Ops({ ops, usage }: { ops: OpIndex[]; usage: UsageFile }) {
  const q = route.value.query;
  const cat = (q.get("cat") || "all") as Category | "all";
  const cls = q.get("cls") || "";
  const branch = q.get("branch") || "";
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "usage", dir: -1 });
  const [limit, setLimit] = useState(50);
  const meta = metaSig.value;
  const s = server.value;
  const here = q.get("here") === "1";
  const filters = useOpFilters();
  const value = (o: OpIndex) => (cat === "all" ? (customised() ? weightedScore(usage.ops[o.id]?.u) : usage.ops[o.id]?.score) : usage.ops[o.id]?.u?.[cat]) || 0;
  const rows = useMemo(() => ops.filter((o) => usage.ops[o.id]?.score && filters.test(o) && (!branch || o.branch === branch) && (!here || o.on.includes(s)))
    .map((o) => ({ o, u: value(o), lift: usage.ops[o.id]?.lift || 0, own: usage.ops[o.id]?.inv?.own || 0 }))
    .sort((a, b) => {
      const k = sort.key as "u" | "lift" | "own";
      const key = sort.key === "usage" ? "u" : k;
      return sort.key === "name" ? a.o.name.localeCompare(b.o.name) * sort.dir : ((a[key] as number) - (b[key] as number)) * sort.dir;
    }), [ops, usage, cat, cls, branch, sort, here, s, contentLevels.value, filters.rarity.join(), filters.own, account.value.ops]);
  const branches = [...new Set(ops.filter((o) => !cls || o.cls === cls).map((o) => o.branch))].sort((a, b) => (meta?.branches[a] || a).localeCompare(meta?.branches[b] || b));
  return (
    <>
      <div class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <div class="field"><span>Content</span>
            <div class="seg" role="group" aria-label="Content type">
              {CATS.map((c) => <button key={c} aria-pressed={c === cat} onClick={() => setQuery({ cat: c === "all" ? "" : c })}>{c === "all" ? "All" : CATEGORY_NAMES[c]}</button>)}
            </div>
          </div>
          <label class="field"><span>Class</span>
            <select value={cls} onChange={(e) => setQuery({ cls: (e.target as HTMLSelectElement).value, branch: "" })}>
              <option value="">Any</option>{CLASS_ORDER.map((c) => <option key={c} value={c}>{CLASS_NAMES[c]}</option>)}
            </select>
          </label>
          <label class="field"><span>Archetype</span>
            <select value={branch} onChange={(e) => setQuery({ branch: (e.target as HTMLSelectElement).value })}>
              <option value="">Any</option>{branches.map((b) => <option key={b} value={b}>{meta?.branches[b] || b}</option>)}
            </select>
          </label>
          <label class="row tight"><input type="checkbox" checked={here} onChange={(e) => setQuery({ here: (e.target as HTMLInputElement).checked ? "1" : "" })} /> Only on this server</label>
        </div>
        <OpFilters />
        {cat === "all" && <WeightsControl compact />}
      </div>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr>
            <th scope="col">#</th>
            <SortTh label="Operator" k="name" sort={sort} setSort={setSort} />
            <th scope="col">Archetype</th>
            <SortTh label="Usage" k="usage" sort={sort} setSort={setSort} num title="Share of community clear guides that use the operator" />
            <SortTh label="Owned by" k="own" sort={sort} setSort={setSort} num title="Share of ~100k surveyed CN accounts that own it" />
            <SortTh label="Lift" k="lift" sort={sort} setSort={setSort} num title="Usage ÷ ownership" />
            <th scope="col">Community build</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => {
              const b = usage.ops[r.o.id].build;
              return (
                <tr key={r.o.id}>
                  <td data-label="#">{i + 1}</td>
                  <td data-label="Operator"><OpLink op={r.o} sub={<><Stars n={r.o.rarity} />{account.value.ops[r.o.id] ? " · owned" : ""}</>} /></td>
                  <td data-label="Archetype">{meta?.branches[r.o.branch] || r.o.branch}</td>
                  <td data-label="Usage" class="num">{pct(r.u)}</td>
                  <td data-label="Owned by" class="num">{r.own ? pct(r.own, 0) : "–"}</td>
                  <td data-label="Lift" class="num">{r.lift ? `${r.lift.toFixed(2)}×` : "–"}</td>
                  <td data-label="Community build"><CommunityMarks b={b} op={r.o} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button onClick={() => setLimit(limit + 100)}>Show more ({rows.length - limit} left)</button>}
      <Explain>Usage: share of {usage.guides.toLocaleString()} community clear guides (MAA Copilot, CN) that use the operator, each stage counted equally{cat === "all" ? ", weighted across content (events 35%, main 25%, CC 20%, Annihilation 10%, other 10%)" : ""}. CN runs ahead of other servers, so percentages read low; rankings hold. Lift: usage ÷ ownership.</Explain>
    </>
  );
}

function Archetypes({ ops, usage }: { ops: OpIndex[]; usage: UsageFile }) {
  const meta = metaSig.value;
  const cat = (route.value.query.get("cat") || "all") as Category | "all";
  const rows = Object.entries(usage.archetypes).map(([a, u]) => ({ a, v: cat === "all" ? (customised() ? weightedScore(u.u) : u.score) : u.u[cat] || 0,
    cls: ops.find((o) => o.branch === a)?.cls, top: ops.filter((o) => o.branch === a).sort((x, y) => (usage.ops[y.id]?.score || 0) - (usage.ops[x.id]?.score || 0)).slice(0, 3) }))
    .filter((r) => r.cls).sort((x, y) => y.v - x.v);
  return (
    <>
      <div class="seg" role="group" aria-label="Content type">
        {CATS.map((c) => <button key={c} aria-pressed={c === cat} onClick={() => setQuery({ cat: c === "all" ? "" : c })}>{c === "all" ? "All" : CATEGORY_NAMES[c]}</button>)}
      </div>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Archetype</th><th>Class</th><th class="num">Used in</th><th>Most used</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.a}>
                <td data-label="Archetype"><a href={href("/rankings", { branch: r.a })}>{meta?.branches[r.a] || r.a}</a></td>
                <td data-label="Class">{CLASS_NAMES[r.cls!]}</td>
                <td data-label="Used in" class="num">{pct(r.v)}</td>
                <td data-label="Most used">{r.top.map((o) => o.name).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explain>Used in: share of community clear guides that use at least one operator of the archetype.{hasRoster.value ? <> Which of these your roster covers poorly: <a href={href("/gaps")}>Gaps</a>.</> : null}</Explain>
    </>
  );
}
