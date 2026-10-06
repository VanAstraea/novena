// My roster: quick bulk entry, depot, import/export and progress over time. Saved in this browser only.
import { useMemo, useState } from "preact/hooks";
import { Chart } from "../components/Chart";
import { undoable } from "../components/Toast";
import { MasteryMark, ModuleMark } from "../components/Marks";
import { DepotImport } from "../components/DepotImport";
import { OpPicker } from "../components/OpPicker";
import { Avatar, Await, Divider, Explain, GIcon, GuideLink, ItemIcon, itemName, Items, itemsSig, metaSig, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { CLASS_NAMES } from "../lib/format";
import { costTable } from "../lib/account";
import { expiring, held, tokenUse, voucherIds, voucherPicks } from "../lib/consumables";
import { art, usage as loadUsage } from "../lib/data";
import { planNeeds } from "../lib/needs";
import { CLASSES } from "../lib/training";
import { EXP, LMD, sanity } from "../lib/costs";
import { diff, type Change } from "../lib/progress";
import { operators } from "../lib/data";
import { date, fmt } from "../lib/format";
import { applyDepot, applyImport, importFile, importText, updateAccount } from "../lib/accountImport";
import { exportRoster, parseDepot, parseRoster } from "../lib/importers";
import { pref, setPref } from "../lib/storage";
import { BridgeError, forget, hello, isPaired, pair, SYNC_SERVERS, syncNow } from "../lib/syncBridge";
import { REPO_URL } from "../config";
import { best } from "../lib/search";
import { href, openPanel, route, setQuery } from "../lib/router";
import { account, loaded, server, type RosterOp } from "../state";
import type { OpIndex } from "../types";

type Tab = "operators" | "depot" | "use" | "import" | "progress";

export default function Roster() {
  const s = server.value;
  const st = useAsync(() => operators(s), [s]);
  const tab = (route.value.query.get("tab") || "operators") as Tab;
  const a = account.value;
  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>My roster</h1>
          <p class="muted">Saved in this browser only, separately for each server. <a href={href("/settings")}>Back it up</a>.</p>
        </div>
        {tab !== "import" && <a class="pill primary" href={href("/roster", { tab: "import" })}>Sync / Import <span aria-hidden="true">→</span></a>}
      </div>
      <Tabs label="Roster sections" value={tab} onChange={(t) => setQuery({ tab: t === "operators" ? "" : t })} tabs={[
        { key: "operators", label: `Operators (${Object.keys(a.ops).length})` }, { key: "depot", label: "Depot" }, { key: "use", label: "To use" },
        { key: "import", label: "Import / export" }, { key: "progress", label: "Progress" },
      ]} />
      <Await state={st} what="operators">
        {(ops) => !loaded.value ? <p class="muted">Loading your data…</p>
          : tab === "depot" ? <Depot /> : tab === "use" ? <ToUse ops={ops} /> : tab === "import" ? <Import ops={ops} /> : tab === "progress" ? <Progress ops={ops} /> : <Ops ops={ops} />}
      </Await>
    </div>
  );
}

const update = updateAccount;

function maxElite(op: OpIndex) {
  return op.rarity >= 4 ? 2 : op.rarity === 3 ? 1 : 0;
}

/** The game's level cap for a rarity at a promotion. */
const LEVEL_CAP: Record<number, number[]> = { 1: [30], 2: [30], 3: [40, 55], 4: [45, 60, 70], 5: [50, 70, 80], 6: [50, 80, 90] };
const maxLevel = (op: OpIndex, elite: number) => (LEVEL_CAP[op.rarity] || [30])[Math.min(elite, maxElite(op))];

/** A change made sensible for one operator: promotion within its rarity, level within the cap, masteries and modules
 *  bringing the E2 and SL7 they need with them. Shared by single edits and edits to many operators at once. */
export function fit(op: OpIndex, r: RosterOp, patch: Partial<RosterOp> & { levelMax?: boolean }): RosterOp {
  const { levelMax, ...p } = patch;
  const n: RosterOp = { ...r, ...p };
  const wantsM = !!p.masteries && p.masteries.some((m) => m > 0);
  const wantsMod = !!p.modules && Object.values(p.modules).some((v) => v > 0);
  if ((wantsM || wantsMod) && maxElite(op) >= 2) n.elite = 2;
  if (wantsM) n.skillLevel = 7;
  n.elite = Math.min(n.elite, maxElite(op));
  if (n.elite < 2) { n.masteries = n.masteries.map(() => 0); n.modules = {}; }
  if (n.elite < 1) n.skillLevel = Math.min(n.skillLevel, 4);
  if (n.skillLevel < 7) n.masteries = n.masteries.map(() => 0);
  n.level = levelMax ? maxLevel(op, n.elite) : Math.min(Math.max(1, n.level), maxLevel(op, n.elite));
  return n;
}

const newOp = (op: OpIndex): RosterOp => ({ id: op.id, elite: 0, level: 1, pot: 1, skillLevel: 1, masteries: [0, 0, 0].slice(0, op.rarity >= 4 ? (op.rarity >= 6 ? 3 : 2) : op.rarity === 3 ? 1 : 0), modules: {} });

type Row = { r: RosterOp; op: OpIndex };

function Ops({ ops }: { ops: OpIndex[] }) {
  const a = account.value;
  const meta = metaSig.value;
  const [filter, setFilter] = useState("");
  const [cls, setCls] = useState("");
  const [rarity, setRarity] = useState(0);
  const [editing, setEditing] = useState(() => pref("rosterEdit", "") === "1");
  const [added, setAdded] = useState<string[]>([]); // added this visit, newest first: shown at the top while editing
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const rows = Object.values(a.ops).map((r) => ({ r, op: byId.get(r.id) })).filter((x) => x.op) as Row[];
  const [sort, setSort] = useState(() => pref("rosterSort", "rarity"));
  const by: Record<string, (x: Row, y: Row) => number> = {
    rarity: (x, y) => y.op.rarity - x.op.rarity || x.op.name.localeCompare(y.op.name),
    name: (x, y) => x.op.name.localeCompare(y.op.name),
    level: (x, y) => y.r.elite - x.r.elite || y.r.level - x.r.level || x.op.name.localeCompare(y.op.name),
    masteries: (x, y) => y.r.masteries.reduce((a, b) => a + b, 0) - x.r.masteries.reduce((a, b) => a + b, 0) || y.op.rarity - x.op.rarity,
    modules: (x, y) => Object.values(y.r.modules).reduce((a, b) => a + b, 0) - Object.values(x.r.modules).reduce((a, b) => a + b, 0) || y.op.rarity - x.op.rarity,
    class: (x, y) => x.op.cls.localeCompare(y.op.cls) || y.op.rarity - x.op.rarity,
  };
  const pick = (v: string) => { setSort(v); setPref("rosterSort", v); };
  const filtered = rows.filter((x) => (!cls || x.op.cls === cls) && (!rarity || x.op.rarity === rarity));
  const sorted = filter.trim() ? best(filter, filtered, (x) => [x.op.name], 500) : filtered.sort(by[sort] || by.rarity);
  const recent = new Map(added.map((id, i) => [id, i]));
  const shown = added.length ? [...sorted].sort((x, y) => (recent.get(x.r.id) ?? 1e9) - (recent.get(y.r.id) ?? 1e9)) : sorted;
  const set = (id: string, patch: Partial<RosterOp>) => update((acc) => ({ ...acc, ops: { ...acc.ops, [id]: fit(byId.get(id)!, acc.ops[id], patch) } }));
  const addMany = (list: OpIndex[]) => {
    const fresh = list.filter((op) => !a.ops[op.id]);
    if (!fresh.length) return;
    update((acc) => {
      const next = { ...acc.ops };
      for (const op of fresh) next[op.id] = newOp(op);
      return { ...acc, ops: next, source: acc.source || "manual" };
    });
    setAdded([...fresh.map((o) => o.id).reverse(), ...added]);
  };
  const here = ops.filter((o) => !o.src && !o.patch);
  const edit = editing || rows.length === 0; // an empty roster opens straight into adding
  const toggle = () => { setEditing(!editing); setPref("rosterEdit", editing ? "" : "1"); setPicked(new Set()); if (editing) setAdded([]); };
  const pick1 = (id: string) => setPicked((was) => { const n = new Set(was); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((x) => picked.has(x.r.id));
  const classes = [...new Set(rows.map((x) => x.op.cls))].sort();
  const Th = ({ k, label, c }: { k?: string; label: string; c?: string }) => (
    <th class={c} aria-sort={k && sort === k && !filter ? "descending" : undefined}>{k ? <button class="sort" onClick={() => pick(k)}>{label}{sort === k && !filter ? " ▾" : ""}</button> : label}</th>
  );
  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          {rows.length > 0 && <label class="field"><span>Find</span><input type="search" value={filter} placeholder="Operator name" onInput={(e) => setFilter((e.target as HTMLInputElement).value)} /></label>}
          {rows.length > 0 && <label class="field"><span>Rarity</span>
            <select value={rarity} onChange={(e) => setRarity(+(e.target as HTMLSelectElement).value)}>
              <option value={0}>All</option>{[6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select></label>}
          {rows.length > 0 && <span class="muted" style={{ marginLeft: "auto" }}>{shown.length} of {rows.length}</span>}
          {rows.length > 0 && <button class={edit ? "primary" : ""} aria-pressed={edit} onClick={toggle}>{edit ? "Done editing" : "Edit roster"}</button>}
        </div>
        {classes.length > 1 && (
          <div class="chips" role="group" aria-label="Class" style={{ marginTop: "10px" }}>
            <button class="chip" aria-pressed={!cls} onClick={() => setCls("")}>All classes</button>
            {classes.map((c) => <button key={c} class="chip cls-chip" aria-pressed={cls === c} onClick={() => setCls(cls === c ? "" : c)}><GIcon src={art.classIcon(c)} alt="" size={16} />{CLASS_NAMES[c] || c}</button>)}
          </div>
        )}
        {edit && (
          <div class="row" style={{ alignItems: "flex-end", marginTop: "12px" }}>
            <OpPicker ops={here} exclude={Object.keys(a.ops)} onPick={(op) => addMany([op])} />
            <button onClick={() => addMany(here.filter((o) => o.rarity <= 3))} title="Most accounts have every 1-3★ operator">Add all 1–3★</button>
            <button onClick={() => addMany(here.filter((o) => o.rarity === 4))} title="Every 4★ operator on this server">Add all 4★</button>
          </div>
        )}
        {edit && picked.size > 0 && <BulkBar ids={[...picked].filter((id) => a.ops[id])} byId={byId} clear={() => setPicked(new Set())} />}
        <Explain>{edit
          ? "Change any value and it's saved straight away. Masteries and modules: click an icon to raise it (it sets E2 and SL7 for you), Shift+click or right-click to lower it. Operators you add appear at the top. Tick operators, or tick the header to take every one shown (filter first), to change many at once."
          : "Your roster as the game shows it. Click an operator for their build, next upgrades and costs. Edit roster to change it by hand, or sync again under Import / export."}</Explain>
      </section>
      {rows.length > 0 ? (
        <div class="table-wrap">
          <table class={`cards roster${edit ? " editing" : ""}`}>
            <thead><tr>
              {edit && <th class="pick"><input type="checkbox" aria-label="Select every operator shown" checked={allShown}
                onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((x) => x.r.id)))} /></th>}
              <Th k="name" label="Operator" /><Th k="class" label="Class" /><Th k="level" label="Elite" c="c" /><th class="c">Level</th><th class="c">Potential</th><th class="c">Skill</th>
              <Th k="masteries" label="Masteries" /><Th k="modules" label="Modules" />{edit && <th><span class="sr-only">Remove</span></th>}
            </tr></thead>
            <tbody>
              {shown.slice(0, edit ? 600 : 400).map(({ r, op }) => edit ? <EditRow key={r.id} r={r} op={op} set={set} picked={picked.has(r.id)} pick={() => pick1(r.id)} isNew={recent.has(r.id)} /> : (
                <tr key={r.id} class="click" onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) openPanel(op.id); }}>
                  <td data-label="Operator"><a class="op-cell" href={href(`/operator/${op.id}`)} data-panel={op.id}><Avatar op={op} size="sm" /><span><span class="op-name">{op.name}</span><br /><Stars n={op.rarity} img /></span></a></td>
                  <td data-label="Class"><span class="row tight"><GIcon src={art.classIcon(op.cls)} alt={CLASS_NAMES[op.cls] || op.cls} size={20} /><small>{meta?.branches[op.branch] || CLASS_NAMES[op.cls]}</small></span></td>
                  <td data-label="Elite" class="c"><GIcon src={art.elite(r.elite)} alt={`Elite ${r.elite}`} size={28} /></td>
                  <td data-label="Level" class="c"><span class="lv">{r.level}</span></td>
                  <td data-label="Potential" class="c"><GIcon src={art.potential(r.pot)} alt={`Potential ${r.pot}`} size={26} /></td>
                  <td data-label="Skill" class="c">{op.rarity >= 3 ? <span class="lv small">{r.skillLevel}</span> : <span class="muted">–</span>}</td>
                  <td data-label="Masteries">{r.masteries.length ? <span class="marks">{r.masteries.map((m, i) => <MasteryMark key={i} m={m} i={i} />)}</span> : <span class="muted">–</span>}</td>
                  <td data-label="Modules">{op.mods.length ? <span class="marks">{op.mods.map((k) => <ModuleMark key={k} op={op} k={k} stage={r.modules[k] || 0} />)}</span> : <span class="muted">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p class="muted">No operators yet. Add them above, or sync or import under Import / export.</p>}
    </>
  );
}

/** Change many operators at once: every control applies to each ticked operator as far as its rarity allows (a 4★
 *  stops at its level cap, a 3★ at E1). Undoable. */
function BulkBar({ ids, byId, clear }: { ids: string[]; byId: Map<string, OpIndex>; clear: () => void }) {
  const apply = (label: string, patch: (op: OpIndex, r: RosterOp) => Partial<RosterOp> & { levelMax?: boolean }) => {
    const before = account.value.ops;
    update((acc) => {
      const ops = { ...acc.ops };
      for (const id of ids) { const op = byId.get(id); if (op && ops[id]) ops[id] = fit(op, ops[id], patch(op, ops[id])); }
      return { ...acc, ops };
    });
    undoable(`${label} for ${ids.length} operator${ids.length > 1 ? "s" : ""}.`, () => update((acc) => ({ ...acc, ops: before })));
  };
  const choose = (label: string, options: [string, string][], on: (v: string) => void) => (
    <label class="field"><span>{label}</span>
      <select value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) on(v); (e.target as HTMLSelectElement).value = ""; }}>
        <option value="">Set…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
  return (
    <div class="bulk-bar" role="group" aria-label="Change the selected operators">
      <strong>{ids.length} selected</strong>
      {choose("Elite", [["0", "E0"], ["1", "E1 (or highest)"], ["2", "E2 (or highest)"]], (v) => apply(`Elite ${v}`, () => ({ elite: +v })))}
      {choose("Level", [["max", "Max for their promotion"], ["1", "1"]], (v) => apply(v === "max" ? "Max level" : "Level 1", () => (v === "max" ? { levelMax: true } : { level: 1 })))}
      {choose("Potential", [1, 2, 3, 4, 5, 6].map((p) => [String(p), `P${p}`] as [string, string]), (v) => apply(`Potential ${v}`, () => ({ pot: +v })))}
      {choose("Skill level", [1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), `SL${n}`] as [string, string]), (v) => apply(`Skill level ${v}`, () => ({ skillLevel: +v })))}
      {choose("Masteries", [["3", "All skills M3"], ["0", "None"]], (v) => apply(v === "3" ? "Every skill to M3" : "Masteries cleared", (_, r) => ({ masteries: r.masteries.map(() => +v) })))}
      {choose("Modules", [["1", "All stage 1"], ["2", "All stage 2"], ["3", "All stage 3"], ["0", "None"]], (v) => apply(+v ? `Every module to stage ${v}` : "Modules cleared", (op) => ({ modules: Object.fromEntries(op.mods.map((k) => [k, +v])) })))}
      <button class="small ghost" onClick={() => {
        const before = account.value.ops;
        update((acc) => { const ops = { ...acc.ops }; for (const id of ids) delete ops[id]; return { ...acc, ops }; });
        undoable(`${ids.length} operator${ids.length > 1 ? "s" : ""} removed.`, () => update((acc) => ({ ...acc, ops: before })));
        clear();
      }}>Remove</button>
      <button class="small ghost" onClick={clear}>Clear selection</button>
    </div>
  );
}

/** One operator in edit mode: dropdowns for promotion and levels, the game's icons as click-to-raise buttons. */
function EditRow({ r, op, set, picked, pick, isNew }: { r: RosterOp; op: OpIndex; set: (id: string, patch: Partial<RosterOp>) => void; picked: boolean; pick: () => void; isNew: boolean }) {
  return (
    <tr class={`${picked ? "picked" : ""}${isNew ? " new" : ""}`}>
      <td data-label="Select" class="pick"><input type="checkbox" aria-label={`Select ${op.name}`} checked={picked} onChange={pick} /></td>
      <td data-label="Operator"><a class="op-cell" href={href(`/operator/${op.id}`)} data-panel={op.id}><Avatar op={op} size="sm" /><span><span class="op-name">{op.name}</span><br /><Stars n={op.rarity} img /></span></a></td>
      <td data-label="Class"><GIcon src={art.classIcon(op.cls)} alt={CLASS_NAMES[op.cls] || op.cls} size={20} /></td>
      <td data-label="Elite" class="c">
        <select aria-label={`${op.name} elite`} value={r.elite} onChange={(e) => set(r.id, { elite: +(e.target as HTMLSelectElement).value })}>
          {Array.from({ length: maxElite(op) + 1 }, (_, i) => <option key={i} value={i}>E{i}</option>)}
        </select>
      </td>
      <td data-label="Level" class="c"><input aria-label={`${op.name} level`} type="number" min={1} max={maxLevel(op, r.elite)} value={r.level} style={{ width: "4.5em" }}
        onChange={(e) => set(r.id, { level: Math.min(90, Math.max(1, +(e.target as HTMLInputElement).value || 1)) })} /></td>
      <td data-label="Potential" class="c">
        <select aria-label={`${op.name} potential`} value={r.pot} onChange={(e) => set(r.id, { pot: +(e.target as HTMLSelectElement).value })}>
          {[1, 2, 3, 4, 5, 6].map((p) => <option key={p} value={p}>P{p}</option>)}
        </select>
      </td>
      <td data-label="Skill" class="c">
        {op.rarity >= 3 ? (
          <select aria-label={`${op.name} skill level`} value={r.skillLevel} onChange={(e) => set(r.id, { skillLevel: +(e.target as HTMLSelectElement).value })}>
            {Array.from({ length: r.elite >= 1 ? 7 : 4 }, (_, i) => <option key={i} value={i + 1}>SL{i + 1}</option>)}
          </select>
        ) : "–"}
      </td>
      <td data-label="Masteries">
        {r.masteries.length ? (
          <span class="marks">
            {r.masteries.map((m, i) => {
              const locked = maxElite(op) < 2;
              const to = (n: number) => { const ms = [...r.masteries]; ms[i] = (n + 4) % 4; set(r.id, { masteries: ms }); };
              return (
                <button key={i} type="button" class="mark-btn" disabled={locked} aria-label={`${op.name} skill ${i + 1}: ${m ? `Mastery ${m}` : "no mastery"}`}
                  title={locked ? "No masteries at this rarity" : `S${i + 1} M${m}. Click to raise (sets E2 and SL7), Shift+click or right-click to lower`}
                  onClick={(e) => to(e.shiftKey ? m - 1 : m + 1)} onContextMenu={(e) => { e.preventDefault(); if (!locked) to(m - 1); }}>
                  <MasteryMark m={m} i={i} />
                </button>
              );
            })}
          </span>
        ) : "–"}
      </td>
      <td data-label="Modules">
        {op.mods.length ? (
          <span class="marks">
            {op.mods.map((k) => {
              const stage = r.modules[k] || 0, locked = maxElite(op) < 2;
              const to = (n: number) => set(r.id, { modules: { ...r.modules, [k]: (n + 4) % 4 } });
              return (
                <button key={k} type="button" class="mark-btn" disabled={locked} aria-label={`${op.name} module ${k}: ${stage ? `stage ${stage}` : "not unlocked"}`}
                  title={`Module ${k} stage ${stage}. Click to raise (sets E2), Shift+click or right-click to lower`}
                  onClick={(e) => to(e.shiftKey ? stage - 1 : stage + 1)} onContextMenu={(e) => { e.preventDefault(); if (!locked) to(stage - 1); }}>
                  <ModuleMark op={op} k={k} stage={stage} />
                </button>
              );
            })}
          </span>
        ) : "–"}
      </td>
      <td data-label=""><button class="small ghost" aria-label={`Remove ${op.name}`} onClick={() => {
        update((acc) => { const o = { ...acc.ops }; delete o[r.id]; return { ...acc, ops: o }; });
        undoable(`${op.name} removed from your roster.`, () => update((acc) => ({ ...acc, ops: { ...acc.ops, [r.id]: r } })));
      }}>✕</button></td>
    </tr>
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
    <section class="card krooster">
      <div class="card-head"><h2>From another planner</h2><GuideLink m="planner" /></div>
      <p class="muted">Kept your depot on Krooster or Penguin Statistics? Bring it over without screenshots.</p>
      <DepotPaste />
    </section>
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

type Msg = { ok: boolean; text: string } | null;

const apply = applyImport;

function Import({ ops }: { ops: OpIndex[] }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [over, setOver] = useState(false);
  const s = server.value;
  const onFile = async (f: File) => {
    try {
      setMsg({ ok: true, text: await importFile(f, ops, s, mode) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(exportRoster(account.value, s), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `novena-roster-${s}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  return (
    <div class="grid two">
      <SyncCard ops={ops} />
      <section class="card">
        <div class="card-head"><h2>Import a file</h2><GuideLink m="file" /></div>
        <p>Accepted: a Novena roster file, a Novena Sync file, game sync data (syncData JSON), a saved Krooster profile page, or a depot export from Krooster or Penguin Statistics.</p>
        <p class="muted">For your depot, the easiest way is screenshots: <a href={href("/roster", { tab: "depot" })}>Depot → Import from screenshots</a>.</p>
        <div class="row" style={{ marginBottom: "10px" }}>
          <div class="seg" role="group" aria-label="Import mode">
            <button aria-pressed={mode === "replace"} onClick={() => setMode("replace")}>Replace roster</button>
            <button aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>Merge</button>
          </div>
        </div>
        <label class={`dropzone${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void onFile(f); }}>
          <span>Drop a file here, or <u>choose one</u></span>
          <input type="file" class="sr-only"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }} />
        </label>
        {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
        <Explain>The file is read in your browser; nothing is uploaded.</Explain>
      </section>
      <KroosterImport ops={ops} mode={mode} />
      <section class="card">
        <div class="card-head"><h2>Export</h2><GuideLink m="move" /></div>
        <p>Download this server's roster and depot as a file you can import elsewhere or keep.</p>
        <button onClick={exportIt} disabled={!Object.keys(account.value.ops).length}>Export roster</button>
      </section>
    </div>
  );
}

/** From Krooster: it has no roster export, but every profile is public. Browsers won't let this page read Krooster
 *  directly, so you bring it over yourself: save your profile page and give Novena the file (the roster is inside it),
 *  or open the profile as text and paste it. */
function KroosterImport({ ops, mode }: { ops: OpIndex[]; mode: "replace" | "merge" }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const user = encodeURIComponent(name.trim().toLowerCase());
  const s = server.value;
  const link = (url: string, label: string) => (
    <a class={`btn small${user ? "" : " disabled"}`} href={user ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!user}>{label}</a>
  );
  const done = (f: () => string | Promise<string>) => async () => {
    try { setMsg({ ok: true, text: await f() }); setText(""); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <section class="card krooster">
      <div class="card-head"><h2>From Krooster</h2><GuideLink m="krooster" /></div>
      <label class="field"><span>Your Krooster username</span>
        <input type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="username" autocomplete="off" spellcheck={false} />
      </label>
      <h3>Save your profile page</h3>
      <ol class="steps">
        <li>{link(`https://www.krooster.com/u/${user}`, "Open my Krooster profile")}</li>
        <li>Save the page: Ctrl+S (⌘S on a Mac), then Save. Either "Webpage" type works.</li>
        <li>
          <label class="btn small">Choose the saved file
            <input type="file" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void done(() => importFile(f, ops, s, mode))(); }} />
          </label>
          <span class="muted"> (the .html one; or drop it on "Import a file")</span>
        </li>
      </ol>
      <h3>Or copy and paste</h3>
      <ol class="steps">
        <li>{link(`https://www.krooster.com/api/u/${user}`, "Open my profile as text")}</li>
        <li>
          Copy all of it:
          <ul class="muted">
            <li>Chrome, Edge, Safari: Ctrl+A, then Ctrl+C (⌘A, ⌘C on a Mac). On a phone: long-press the text, Select all, Copy.</li>
            <li>Firefox: click <em>Raw Data</em> at the top, then <em>Copy</em>.</li>
          </ul>
        </li>
        <li>
          Paste it here:
          <textarea rows={3} aria-label="Paste your Krooster profile here" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder='{"data":{"account":…' spellcheck={false} style={{ marginTop: "6px" }} />
          <button class="primary" disabled={!text.trim()} onClick={done(() => importText(text, ops, s, mode, "That isn't what your Krooster profile shows"))} style={{ marginTop: "8px" }}>Import from Krooster</button>
        </li>
      </ol>
      {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
      <h3>Your depot</h3>
      <DepotPaste />
      <Explain>Krooster profiles are public, so no sign-in is needed. The pages open on Krooster's site; Novena only reads the file you choose or the text you paste, in your browser. Profiles don't include the depot, which is why it's a separate step.</Explain>
    </section>
  );
}

/** A depot copied out of Krooster's planner (its Penguin-Stats or CSV export) or Penguin Statistics' planner. Only the
 *  items it lists change; the roster stays. */
export function DepotPaste() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const go = () => {
    try {
      const d = parseDepot(text);
      if (!d) throw new Error("That isn't a depot export. In Krooster's Export/Import, pick Penguin-Stats or CSV and copy again.");
      setMsg({ ok: true, text: applyDepot(d.depot, d.format) }); setText("");
    }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <div class="depot-paste">
      <ol class="steps">
        <li>On Krooster, open <a href="https://www.krooster.com/data/planner" target="_blank" rel="noopener noreferrer">Planner</a>, click the gear on the materials list, then <em>Export/Import</em>.</li>
        <li>Set <em>Export format</em> to Penguin-Stats (CSV works too) and press the copy button. (Penguin Statistics' own planner export works the same way.)</li>
        <li>
          Paste it here:
          <textarea rows={3} aria-label="Paste your depot export here" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder='{"@type":"@penguin-statistics/planner/config",…' spellcheck={false} style={{ marginTop: "6px" }} />
          <button class="primary" disabled={!text.trim()} onClick={go} style={{ marginTop: "8px" }}>Update my depot</button>
        </li>
      </ol>
      {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
    </div>
  );
}

/** One-click sync from Novena Sync, the optional desktop app. The page only talks to it when you click. */
function SyncCard({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const [stage, setStage] = useState<"start" | "pair" | "ready">(isPaired() ? "ready" : "start");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [asking, setAsking] = useState(false);
  const [noAsk, setNoAsk] = useState(false);
  const supported = SYNC_SERVERS.includes(s);
  const last = Number(pref(`syncedAt.${s}`, "0"));
  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await step();
    } catch (e) {
      const err = e as BridgeError;
      if (err.code === "not-paired") setStage("pair");
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };
  const connect = () => run(async () => {
    const h = await hello();
    setStage(h.paired ? "ready" : "pair");
  });
  const doPair = () => run(async () => {
    await pair(code);
    setCode("");
    setStage("ready");
    setMsg({ ok: true, text: "Paired. From now on, one click syncs." });
  });
  // A sync signs the player out of the game on their other devices, so it asks first (unless told not to).
  const startSync = () => (pref("syncConfirm", "on") === "off" ? void sync() : setAsking(true));
  const confirmSync = () => {
    if (noAsk) setPref("syncConfirm", "off");
    setAsking(false);
    void sync();
  };
  const sync = () => run(async () => {
    const res = await syncNow(s);
    const r = parseRoster(res.payload, ops);
    const text = apply(r, "replace");
    setPref(`syncedAt.${s}`, String(Date.now()));
    setMsg({ ok: true, text: res.fresh ? text : `${text} That's your sync from moments ago: a fresh one is possible in ${Math.ceil(res.retryAfter / 60)} min.` });
  });
  return (
    <section class="card sync-card" style={{ gridColumn: "1 / -1" }}>
      <div class="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div class="card-head"><h2>Novena Sync <span class="badge">Optional app</span></h2><GuideLink m="sync" /></div>
          <p style={{ maxWidth: "70ch" }}>A small desktop app that signs in to your game account <strong>on your own computer</strong>, reads it, and hands Novena your operators, depot and currencies with one click. This website never sees your login.</p>
        </div>
        <a class="btn" href={`${REPO_URL}/releases/latest`} rel="noopener">Download Novena Sync</a>
      </div>
      {!supported ? <p class="muted">Novena Sync works with the EN, JP and KR servers.</p>
        : stage === "start" ? (
          <div class="row"><button class="primary" onClick={connect} disabled={busy}>{busy ? "Connecting…" : "Connect to Novena Sync"}</button>
            <span class="muted">Open the app first. Your browser may ask to allow access to devices on your network.</span></div>
        ) : stage === "pair" ? (
          <form class="row" onSubmit={(e) => { e.preventDefault(); void doPair(); }}>
            <label class="field"><span>Code shown in Novena Sync</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} placeholder="000 000" style={{ width: "9em" }} /></label>
            <button class="primary" type="submit" disabled={busy || code.replace(/\D/g, "").length !== 6} style={{ alignSelf: "flex-end" }}>Pair</button>
          </form>
        ) : asking ? (
          <div class="note">
            <p style={{ margin: "0 0 8px" }}><strong>This signs you out of Arknights on your phone or PC</strong> (the game allows one session at a time). If you're in a stage, finish it first.</p>
            <div class="row">
              <button class="primary" onClick={confirmSync}>Sync now</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
              <label class="row tight"><input type="checkbox" checked={noAsk} onChange={(e) => setNoAsk((e.target as HTMLInputElement).checked)} /> Don't ask again</label>
            </div>
          </div>
        ) : (
          <div class="row">
            <button class="primary" onClick={startSync} disabled={busy}>{busy ? "Syncing…" : `Sync ${s.toUpperCase()} now`}</button>
            <span class="muted">{last ? `Last synced ${date(last)}, ${new Date(last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "Not synced yet."} Replaces this server's roster and depot.</span>
            <button class="ghost small" onClick={() => { forget(); setStage("start"); setMsg(null); }}>Unpair</button>
          </div>
        )}
      {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
      <p class="warn-text" style={{ margin: "10px 0 0" }}>Each sync signs you out of the game on your other devices. Play, close the game, then sync: once or twice a day is plenty. Reopening the game afterwards needs no new code.</p>
      <Explain>Unofficial: the app uses the community's unofficial sign-in, at your own risk, and only reads your account. It never plays or changes the game. Every sync is a sign-in Yostar can see, so sync only as often as you need; syncs are also spaced a few minutes apart.</Explain>
    </section>
  );
}

/** Items waiting to be used: training vouchers (and who to spend them on), potential tokens, and what expires. */
function ToUse({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const st = useAsync(() => Promise.all([costTable(s), loadUsage()]), [s]);
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const items = itemsSig.value, meta = metaSig.value;
  const a = account.value;
  const setVoucher = (id: string, n: number) => update((acc) => {
    const keep = (acc.consumables?.[id] || []).filter((x) => x.ts > 0);
    return { ...acc, consumables: { ...acc.consumables, [id]: n > 0 ? [...keep, { count: n, ts: -1 }] : keep } };
  });
  const classLabel = (cls: string) => CLASSES.find(([c]) => c === cls)?.[1] || cls;
  return (
    <Await state={st} what="costs and community data">
      {([costs, usage]) => {
        if (!items || !meta) return <p class="muted">Loading…</p>;
        const goals = planNeeds(ops, costs, meta, items).goals;
        const have = held(a);
        const vouchers = voucherIds(items);
        const tokens = Object.entries(a.depot).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, use: tokenUse(id, items, a.ops, byId, classLabel) }))
          .filter((t) => t.use).sort((x, y) => Number(y.use!.ready) - Number(x.use!.ready) || x.use!.target.localeCompare(y.use!.target));
        const soon = expiring(a, items);
        const potion = soon.reduce((t, e) => t + (e.sanity || 0), 0);
        const days = (ts: number) => Math.max(0, Math.ceil((ts * 1000 - Date.now()) / 86400_000));
        return (
          <div class="stack">
            <section class="card">
              <h2>Training vouchers</h2>
              <p class="muted">Novena Sync brings these in; or type how many you have. Each one is ranked against your roster: what your plan raises first, then what players most often raise that far, then the dearest to raise by hand.</p>
              <div class="stack">
                {vouchers.map((id) => {
                  const n = have[id] || 0;
                  const picks = n ? voucherPicks(id, items, a.ops, byId, costs, meta.const, usage, goals) : [];
                  return (
                    <div key={id} class="voucher">
                      <div class="row">
                        <ItemIcon id={id} bare /><strong>{itemName(id)}</strong>
                        <label class="row tight" style={{ marginLeft: "auto" }}><span class="muted">Have</span>
                          <input type="number" min={0} max={99} value={n} onChange={(e) => setVoucher(id, Math.max(0, Number((e.target as HTMLInputElement).value) || 0))} /></label>
                      </div>
                      {n > 0 && (picks.length ? (
                        <ol class="picks">{picks.map((p) => (
                          <li key={p.id + p.upgrade}><OpLink op={byId.get(p.id)!} /> <span>{p.upgrade}</span>
                            <small class="muted"> · saves ~{fmt(p.sanity)} sanity{p.planned ? " · in your plan" : ""}{p.rate ? ` · ${Math.round(p.rate * 100)}% of players do this` : ""}</small></li>
                        ))}</ol>
                      ) : <p class="muted">Nobody in your roster can use it right now.</p>)}
                    </div>
                  );
                })}
              </div>
            </section>
            <section class="card">
              <h2>Potential tokens</h2>
              {tokens.length ? (
                <ul>{tokens.map((t) => <li key={t.id}><span class="row tight"><ItemIcon id={t.id} count={t.n} /> <strong>{t.use!.target}</strong></span> <span class={t.use!.ready ? "" : "muted"}>{t.use!.note}</span></li>)}</ul>
              ) : <p class="muted">No potential tokens in your depot. They come in with Novena Sync or a sync file, or add them on the Depot tab.</p>}
            </section>
            <section class="card">
              <h2>Expiring soon</h2>
              {soon.length ? (
                <>
                  {potion > 0 && <p>Sanity potions hold <strong>{potion}</strong> sanity before they expire: plan them into your farming.</p>}
                  <div class="table-wrap">
                    <table class="cards">
                      <thead><tr><th>Item</th><th class="num">Count</th><th>Expires</th></tr></thead>
                      <tbody>{soon.map((e, i) => (
                        <tr key={e.id + i}>
                          <td data-label="Item"><span class="row tight"><ItemIcon id={e.id} bare />{itemName(e.id)}</span></td>
                          <td data-label="Count" class="num">{e.count}{e.sanity ? <small class="muted"> ({e.sanity} sanity)</small> : null}</td>
                          <td data-label="Expires" class={days(e.ts) <= 7 ? "warn-text" : ""}>{date(e.ts * 1000)} <small class="muted">in {days(e.ts)} day{days(e.ts) === 1 ? "" : "s"}</small></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              ) : <p class="muted">Nothing that expires. Time-limited items (sanity potions, limited permits) come in with Novena Sync or a sync file.</p>}
            </section>
          </div>
        );
      }}
    </Await>
  );
}

function Progress({ ops }: { ops: OpIndex[] }) {
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

