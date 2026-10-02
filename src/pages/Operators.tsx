// The operator database: every operator, searchable and filterable; filters live in the URL.
import { useMemo } from "preact/hooks";
import { Await, metaSig, PortraitCard, useAsync } from "../components/ui";
import { operators, usage as loadUsage } from "../lib/data";
import { CLASS_NAMES, CLASS_ORDER, OBTAIN_NAMES, pct } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { best } from "../lib/search";
import { account, SERVERS, server } from "../state";
import type { OpIndex, UsageFile } from "../types";

function Filters({ ops }: { ops: OpIndex[] }) {
  const q = route.value.query;
  const branches = metaSig.value?.branches || {};
  const factions = metaSig.value?.factions || {};
  const cls = q.get("cls") || "";
  const branchOpts = [...new Set(ops.filter((o) => !cls || o.cls === cls).map((o) => o.branch))]
    .sort((a, b) => (branches[a] || a).localeCompare(branches[b] || b));
  const factionOpts = [...new Set(ops.flatMap((o) => o.factions))].sort((a, b) => (factions[a] || a).localeCompare(factions[b] || b));
  const sel = (key: string, label: string, opts: [string, string][]) => (
    <label class="field">
      <span>{label}</span>
      <select value={q.get(key) || ""} onChange={(e) => setQuery({ [key]: (e.target as HTMLSelectElement).value, ...(key === "cls" ? { branch: "" } : {}) })}>
        <option value="">Any</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const rarities = (q.get("r") || "").split(",").filter(Boolean);
  return (
    <div class="card">
      <div class="row" style={{ alignItems: "flex-end" }}>
        <label class="field grow" style={{ minWidth: "200px" }}>
          <span>Name</span>
          <input type="search" value={q.get("q") || ""} placeholder="Search operators" onInput={(e) => setQuery({ q: (e.target as HTMLInputElement).value })} />
        </label>
        {sel("cls", "Class", CLASS_ORDER.map((c) => [c, CLASS_NAMES[c]]))}
        {sel("branch", "Branch", branchOpts.map((b) => [b, branches[b] || b]))}
        {sel("faction", "Faction", factionOpts.map((f) => [f, factions[f] || f]))}
        {sel("obtain", "How to get", Object.entries(OBTAIN_NAMES))}
        {sel("on", "Available on", [["here", "This server"], ["cnonly", "CN only (not here yet)"], ...SERVERS.map((s) => [s.id, s.long] as [string, string])])}
        <label class="field">
          <span>Sort</span>
          <select value={q.get("sort") || "rarity"} onChange={(e) => setQuery({ sort: (e.target as HTMLSelectElement).value === "rarity" ? "" : (e.target as HTMLSelectElement).value })}>
            <option value="rarity">Rarity</option><option value="name">Name</option><option value="usage">Community usage</option><option value="new">Newest</option>
          </select>
        </label>
      </div>
      <div class="row" style={{ marginTop: "10px" }} role="group" aria-label="Rarity">
        {[6, 5, 4, 3, 2, 1].map((r) => {
          const on = rarities.includes(String(r));
          return (
            <button key={r} class="chip" aria-pressed={on}
              onClick={() => setQuery({ r: (on ? rarities.filter((x) => x !== String(r)) : [...rarities, String(r)]).join(",") })}>
              {r}★
            </button>
          );
        })}
        <button class="chip" aria-pressed={q.get("recruit") === "1"} onClick={() => setQuery({ recruit: q.get("recruit") === "1" ? "" : "1" })}>Recruitable</button>
        <button class="chip" aria-pressed={q.get("owned") === "1"} onClick={() => setQuery({ owned: q.get("owned") === "1" ? "" : "1" })}
          disabled={!Object.keys(account.value.ops).length} title={Object.keys(account.value.ops).length ? "" : "Add your roster under My account"}>Owned</button>
        {[...q.keys()].length > 0 && <button class="small ghost" onClick={() => setQuery(Object.fromEntries([...q.keys()].map((k) => [k, ""])))}>Clear filters</button>}
      </div>
    </div>
  );
}

function filtered(ops: OpIndex[], usage: UsageFile): OpIndex[] {
  const q = route.value.query;
  const s = server.value;
  const r = (q.get("r") || "").split(",").filter(Boolean).map(Number);
  let out = ops.filter((o) =>
    (!q.get("cls") || o.cls === q.get("cls")) && (!q.get("branch") || o.branch === q.get("branch"))
    && (!q.get("faction") || o.factions.includes(q.get("faction")!)) && (!q.get("obtain") || o.obtain === q.get("obtain"))
    && (!r.length || r.includes(o.rarity)) && (q.get("recruit") !== "1" || o.recruit)
    && (q.get("owned") !== "1" || !!account.value.ops[o.id])
    && (() => {
      const on = q.get("on");
      if (!on) return true;
      if (on === "here") return o.on.includes(s);
      if (on === "cnonly") return !o.on.includes(s);
      return o.on.includes(on as never);
    })());
  const text = q.get("q") || "";
  if (text.trim()) return best(text, out, (o) => [o.name, o.cn, o.alt], 500);
  const sort = q.get("sort") || "rarity";
  const num = (id: string) => parseInt(id.split("_")[1], 10) || 0;
  out = [...out].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name)
      : sort === "usage" ? (usage.ops[b.id]?.score || 0) - (usage.ops[a.id]?.score || 0)
        : sort === "new" ? num(b.id) - num(a.id)
          : b.rarity - a.rarity || a.name.localeCompare(b.name));
  return out;
}

export default function Operators() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage()]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Operators</h1>
      <Await state={st} what="operators">
        {([ops, usage]) => <List ops={ops} usage={usage} />}
      </Await>
    </div>
  );
}

function List({ ops, usage }: { ops: OpIndex[]; usage: UsageFile }) {
  const q = route.value.query;
  const list = useMemo(() => filtered(ops, usage), [ops, usage, q.toString(), account.value]);
  const branches = metaSig.value?.branches || {};
  return (
    <>
      <Filters ops={ops} />
      <p class="muted" role="status">{list.length} of {ops.length} operators{q.get("sort") === "usage" ? " · usage = share of community clear guides that use them, weighted across content" : ""}</p>
      <div class="op-grid">
        {list.map((o) => {
          const mine = account.value.ops[o.id];
          const sub = q.get("sort") === "usage" && usage.ops[o.id]?.score !== undefined ? `Usage ${pct(usage.ops[o.id].score)}`
            : mine ? `Yours · E${mine.elite} Lv ${mine.level}` : branches[o.branch] || CLASS_NAMES[o.cls];
          return <PortraitCard key={o.id} op={o} href={href(`/operator/${o.id}`)} sub={sub} elite={mine?.elite ?? 0} />;
        })}
      </div>
    </>
  );
}
