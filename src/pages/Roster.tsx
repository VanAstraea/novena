// My roster: quick bulk entry, depot, import/export and progress over time. Saved in this browser only.
import { useMemo, useState } from "preact/hooks";
import { DepotImport } from "../components/DepotImport";
import { OpPicker } from "../components/OpPicker";
import { Avatar, Await, Explain, ItemIcon, itemsSig, Stars, Tabs, useAsync } from "../components/ui";
import { operators } from "../lib/data";
import { date } from "../lib/format";
import { exportRoster, parseRoster } from "../lib/importers";
import { best } from "../lib/search";
import { href, route, setQuery } from "../lib/router";
import { account, loaded, saveAccount, server, snapshotOf, type Account, type RosterOp } from "../state";
import type { OpIndex } from "../types";

type Tab = "operators" | "depot" | "import" | "progress";

export default function Roster() {
  const s = server.value;
  const st = useAsync(() => operators(s), [s]);
  const tab = (route.value.query.get("tab") || "operators") as Tab;
  const a = account.value;
  return (
    <div class="stack fade-in">
      <h1>My roster</h1>
      <p class="muted">Saved in this browser only, separately for each server. <a href={href("/settings")}>Back it up</a>.</p>
      <Tabs label="Roster sections" value={tab} onChange={(t) => setQuery({ tab: t === "operators" ? "" : t })} tabs={[
        { key: "operators", label: `Operators (${Object.keys(a.ops).length})` }, { key: "depot", label: "Depot" },
        { key: "import", label: "Import / export" }, { key: "progress", label: "Progress" },
      ]} />
      <Await state={st} what="operators">
        {(ops) => !loaded.value ? <p class="muted">Loading your data…</p>
          : tab === "depot" ? <Depot /> : tab === "import" ? <Import ops={ops} /> : tab === "progress" ? <Progress /> : <Ops ops={ops} />}
      </Await>
    </div>
  );
}

function update(fn: (a: Account) => Account) {
  saveAccount(snapshotOf({ ...fn(account.value), updated: Date.now() }));
}

function maxElite(op: OpIndex) {
  return op.rarity >= 4 ? 2 : op.rarity === 3 ? 1 : 0;
}

const newOp = (op: OpIndex): RosterOp => ({ id: op.id, elite: 0, level: 1, pot: 1, skillLevel: 1, masteries: [0, 0, 0].slice(0, op.rarity >= 4 ? (op.rarity >= 6 ? 3 : 2) : op.rarity === 3 ? 1 : 0), modules: {} });

function Ops({ ops }: { ops: OpIndex[] }) {
  const a = account.value;
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const rows = Object.values(a.ops).map((r) => ({ r, op: byId.get(r.id) })).filter((x) => x.op) as { r: RosterOp; op: OpIndex }[];
  const shown = filter.trim() ? best(filter, rows, (x) => [x.op.name], 500) : rows.sort((x, y) => y.op.rarity - x.op.rarity || x.op.name.localeCompare(y.op.name));
  const set = (id: string, patch: Partial<RosterOp>) => update((acc) => ({ ...acc, ops: { ...acc.ops, [id]: { ...acc.ops[id], ...patch } } }));
  const addMany = (list: OpIndex[]) => update((acc) => {
    const next = { ...acc.ops };
    for (const op of list) if (!next[op.id]) next[op.id] = newOp(op);
    return { ...acc, ops: next, source: acc.source || "manual" };
  });
  const here = ops.filter((o) => !o.src && !o.patch);
  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <OpPicker ops={here} exclude={Object.keys(a.ops)} onPick={(op) => addMany([op])} />
          <button onClick={() => addMany(here.filter((o) => o.rarity <= 3))} title="Most accounts have every 1-3★ operator">Add all 1–3★</button>
          {rows.length > 0 && <label class="field"><span>Find in roster</span><input type="search" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} /></label>}
        </div>
        <Explain>Change any value and it's saved straight away. Skill level is shared by all skills; masteries and modules are per skill and per module. Or import a file under Import / export.</Explain>
      </section>
      {rows.length > 0 ? (
        <div class="table-wrap">
          <table class="cards">
            <thead><tr><th>Operator</th><th>Elite</th><th>Level</th><th>Pot</th><th>Skill lv</th><th>Masteries</th><th>Modules</th><th><span class="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {shown.slice(0, 400).map(({ r, op }) => (
                <tr key={r.id}>
                  <td data-label="Operator"><a class="op-cell" href={href(`/operator/${op.id}`)}><Avatar op={op} size="sm" /><span><span class="op-name">{op.name}</span><br /><Stars n={op.rarity} /></span></a></td>
                  <td data-label="Elite">
                    <select aria-label={`${op.name} elite`} value={r.elite} onChange={(e) => set(r.id, { elite: +(e.target as HTMLSelectElement).value })}>
                      {Array.from({ length: maxElite(op) + 1 }, (_, i) => <option key={i} value={i}>E{i}</option>)}
                    </select>
                  </td>
                  <td data-label="Level"><input aria-label={`${op.name} level`} type="number" min={1} max={90} value={r.level} style={{ width: "4.5em" }}
                    onChange={(e) => set(r.id, { level: Math.min(90, Math.max(1, +(e.target as HTMLInputElement).value || 1)) })} /></td>
                  <td data-label="Pot">
                    <select aria-label={`${op.name} potential`} value={r.pot} onChange={(e) => set(r.id, { pot: +(e.target as HTMLSelectElement).value })}>
                      {[1, 2, 3, 4, 5, 6].map((p) => <option key={p} value={p}>P{p}</option>)}
                    </select>
                  </td>
                  <td data-label="Skill lv">
                    {op.rarity >= 3 ? (
                      <select aria-label={`${op.name} skill level`} value={r.skillLevel} onChange={(e) => set(r.id, { skillLevel: +(e.target as HTMLSelectElement).value })}>
                        {Array.from({ length: r.elite >= 1 ? 7 : 4 }, (_, i) => <option key={i} value={i + 1}>SL{i + 1}</option>)}
                      </select>
                    ) : "–"}
                  </td>
                  <td data-label="Masteries">
                    {op.rarity >= 4 ? (
                      <span class="row tight">
                        {r.masteries.map((m, i) => (
                          <select key={i} aria-label={`${op.name} S${i + 1} mastery`} value={m} disabled={r.elite < 2 || r.skillLevel < 7}
                            title={r.elite < 2 || r.skillLevel < 7 ? "Masteries need E2 and SL7" : ""}
                            onChange={(e) => { const ms = [...r.masteries]; ms[i] = +(e.target as HTMLSelectElement).value; set(r.id, { masteries: ms }); }}>
                            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>S{i + 1} {n ? `M${n}` : "–"}</option>)}
                          </select>
                        ))}
                      </span>
                    ) : "–"}
                  </td>
                  <td data-label="Modules">
                    {op.mods.length ? (
                      <span class="row tight">
                        {op.mods.map((k) => (
                          <select key={k} aria-label={`${op.name} module ${k}`} value={r.modules[k] || 0} disabled={r.elite < 2}
                            onChange={(e) => set(r.id, { modules: { ...r.modules, [k]: +(e.target as HTMLSelectElement).value } })}>
                            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{k} {n || "–"}</option>)}
                          </select>
                        ))}
                      </span>
                    ) : "–"}
                  </td>
                  <td data-label=""><button class="small ghost" aria-label={`Remove ${op.name}`} onClick={() => update((acc) => { const o = { ...acc.ops }; delete o[r.id]; return { ...acc, ops: o }; })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p class="muted">No operators yet. Add them above, or import a file.</p>}
    </>
  );
}

function Depot() {
  const items = itemsSig.value;
  const a = account.value;
  const [showAll, setShowAll] = useState(false);
  if (!items) return <p class="muted">Loading items…</p>;
  const list = Object.entries(items.items).filter(([id, it]) => ["material", "chip", "skill", "exp", "lmd", "module"].includes(it.group) && id !== "EXP")
    .filter(([id]) => showAll || items.values[id] !== undefined || a.depot[id] || ["4001", "mod_unlock_token", "mod_update_token_1", "mod_update_token_2"].includes(id))
    .sort((x, y) => (x[0] === "4001" ? -1 : y[0] === "4001" ? 1 : y[1].rarity - x[1].rarity || x[1].sort - y[1].sort));
  const set = (id: string, n: number) => update((acc) => { const d = { ...acc.depot }; if (n > 0) d[id] = n; else delete d[id]; return { ...acc, depot: d }; });
  return (
    <>
    <DepotImport />
    <section class="card">
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Depot</h2>
        <label class="row tight"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll((e.target as HTMLInputElement).checked)} /> Show every item</label>
      </div>
      <div class="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", marginTop: "10px" }}>
        {list.map(([id]) => (
          <label key={id} class="row" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: "8px", padding: "4px 8px" }}>
            <ItemIcon id={id} />
            <input type="number" min={0} value={a.depot[id] || ""} placeholder="0" style={{ width: id === "4001" ? "8em" : "5.5em" }}
              aria-label={`${items.items[id]?.name} held`} onChange={(e) => set(id, Math.max(0, +(e.target as HTMLInputElement).value || 0))} />
          </label>
        ))}
      </div>
      <Explain>Enter what you hold. The planners subtract it and craft from it where they can. Battle Records count as EXP.</Explain>
    </section>
    </>
  );
}

function Import({ ops }: { ops: OpIndex[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const s = server.value;
  const onFile = async (f: File) => {
    try {
      const r = parseRoster(JSON.parse(await f.text()), ops);
      update((acc) => ({
        ...acc, ops: mode === "replace" ? r.ops : { ...acc.ops, ...r.ops },
        depot: r.depot ? (mode === "replace" ? r.depot : { ...acc.depot, ...r.depot }) : acc.depot,
        savings: r.savings || acc.savings, source: "import",
      }));
      setMsg({ ok: true, text: `Imported ${Object.keys(r.ops).length} operators${r.depot ? ` and ${Object.keys(r.depot).length} depot items` : ""} from a ${r.format}${r.skipped ? ` (${r.skipped} entries skipped: unknown on this server)` : ""}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(exportRoster(account.value, s), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dtk-roster-${s}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  return (
    <div class="grid two">
      <section class="card">
        <h2>Import</h2>
        <p>Accepted: a Doctor's Toolkit roster file, game sync data (syncData JSON), or a Krooster operator export.</p>
        <p class="muted">For your depot, the easiest way is screenshots: <a href={href("/roster", { tab: "depot" })}>Depot → Import from screenshots</a>.</p>
        <div class="row">
          <div class="seg" role="group" aria-label="Import mode">
            <button aria-pressed={mode === "replace"} onClick={() => setMode("replace")}>Replace roster</button>
            <button aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>Merge</button>
          </div>
          <label class="btn primary">Choose file<input type="file" accept=".json,application/json" class="sr-only"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }} /></label>
        </div>
        {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
        <Explain>The file is read in your browser; nothing is uploaded.</Explain>
      </section>
      <section class="card">
        <h2>Export</h2>
        <p>Download this server's roster and depot as a file you can import elsewhere or keep.</p>
        <button onClick={exportIt} disabled={!Object.keys(account.value.ops).length}>Export roster</button>
      </section>
      <section class="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Optional: export from the game with the command-line tool</h2>
        <p>The repository includes <code>dtk-export</code>, a small Python script that logs in to your game account <strong>on your own computer</strong> and writes a roster file you import here. This website never sees your login.</p>
        <p class="warn-text"><strong>Account risk:</strong> it uses an unofficial login (the same approach as other community tools). It only reads your data, but it isn't sanctioned by Yostar or Hypergryph. Manual entry above is the recommended, risk-free path.</p>
        <p>See <code>cli/README.md</code> in the repository for how to run it.</p>
      </section>
    </div>
  );
}

function Progress() {
  const snaps = account.value.snapshots;
  if (snaps.length < 1) return <p class="muted">Progress is recorded once a day whenever you edit or import your roster.</p>;
  const series: [keyof (typeof snaps)[0], string][] = [["ops", "Operators"], ["e2", "E2"], ["m3", "M3 skills"], ["mods", "Modules"]];
  return (
    <div class="grid two">
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

function Chart({ label, points }: { label: string; points: [number, number][] }) {
  const w = 320, h = 120, pad = 24;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys) + (Math.max(...ys) === Math.min(...ys) ? 1 : 0)];
  const px = (x: number) => pad + (x1 === x0 ? (w - 2 * pad) / 2 : ((x - x0) / (x1 - x0)) * (w - 2 * pad));
  const py = (y: number) => h - pad - ((y - y0) / (y1 - y0)) * (h - 2 * pad);
  return (
    <section class="card">
      <h3>{label}: {ys[ys.length - 1]}</h3>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} over time: from ${ys[0]} to ${ys[ys.length - 1]}`}>
        <polyline fill="none" stroke="var(--accent)" stroke-width="2" points={points.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")} />
        {points.map((p) => <circle key={p[0]} cx={px(p[0])} cy={py(p[1])} r="3" fill="var(--accent)" />)}
        <text x={pad} y={h - 6} fill="var(--muted)" font-size="10">{date(x0)}</text>
        <text x={w - pad} y={h - 6} fill="var(--muted)" font-size="10" text-anchor="end">{date(x1)}</text>
      </svg>
    </section>
  );
}
