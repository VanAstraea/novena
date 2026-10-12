// The roster's Operators tab: the table, editing by hand (one row or many at once) and the rules that keep a change
// sensible for an operator's rarity.
import { useMemo, useState } from "preact/hooks";
import { undoable } from "../../components/Toast";
import { MasteryMark, ModuleMark } from "../../components/Marks";
import { ModuleInfoButton, moduleInfoProps } from "../../components/ModuleInfo";
import { OpPicker } from "../../components/OpPicker";
import { Avatar, Explain, GIcon, metaSig, Stars } from "../../components/ui";
import { CLASS_NAMES } from "../../lib/format";
import { art } from "../../lib/data";
import { updateAccount } from "../../lib/accountImport";
import { pref, setPref } from "../../lib/storage";
import { best } from "../../lib/search";
import { href, openPanel } from "../../lib/router";
import { account, type RosterOp } from "../../state";
import type { OpIndex } from "../../types";

const update = updateAccount;

function maxElite(op: OpIndex) {
  return op.rarity >= 4 ? 2 : op.rarity === 3 ? 1 : 0;
}

/** The game's level cap for a rarity at a promotion. */
const LEVEL_CAP: Record<number, number[]> = { 1: [30], 2: [30], 3: [40, 55], 4: [45, 60, 70], 5: [50, 70, 80], 6: [50, 80, 90] };
export const maxLevel = (op: OpIndex, elite: number) => (LEVEL_CAP[op.rarity] || [30])[Math.min(elite, maxElite(op))];

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

export function Ops({ ops }: { ops: OpIndex[] }) {
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
          ? "Change any value and it's saved straight away. Masteries and modules: click an icon to raise it (it sets E2 and SL7 for you), Shift+click or right-click to lower it. Hover a module, or tap its i, to see what it does. Operators you add appear at the top. Tick operators, or tick the header to take every one shown (filter first), to change many at once."
          : "Your roster as the game shows it. Click an operator for their build, next upgrades and costs, or a module icon for what the module does. Edit roster to change it by hand, or sync again under Import / export."}</Explain>
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
              // hovering or focusing the icon shows what the module does (clicking it raises the stage); on touch
              // screens the "i" beside it does
              return (
                <span key={k} class="mod-edit">
                  <button type="button" class="mark-btn" disabled={locked} aria-label={`${op.name} module ${k}: ${stage ? `stage ${stage}` : "not unlocked"}`}
                    {...moduleInfoProps(op.id, k, stage, false, "Click to raise (sets E2), Shift+click or right-click to lower")}
                    onClick={(e) => to(e.shiftKey ? stage - 1 : stage + 1)} onContextMenu={(e) => { e.preventDefault(); if (!locked) to(stage - 1); }}>
                    <ModuleMark op={op} k={k} stage={stage} info={false} />
                  </button>
                  {!locked && <ModuleInfoButton id={op.id} k={k} stage={stage} />}
                </span>
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
