// My roster: quick bulk entry, depot, import/export and progress over time. Saved in this browser only.
import { useMemo, useState } from "preact/hooks";
import { DepotImport } from "../components/DepotImport";
import { OpPicker } from "../components/OpPicker";
import { Avatar, Await, Explain, ItemIcon, itemName, Items, itemsSig, metaSig, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { costTable } from "../lib/account";
import { expiring, held, tokenUse, voucherIds, voucherPicks } from "../lib/consumables";
import { usage as loadUsage } from "../lib/data";
import { planNeeds } from "../lib/needs";
import { CLASSES } from "../lib/training";
import { EXP, LMD, sanity } from "../lib/costs";
import { diff, type Change } from "../lib/progress";
import { operators } from "../lib/data";
import { date, fmt } from "../lib/format";
import { exportRoster, parseRoster, type Imported } from "../lib/importers";
import { pref, setPref } from "../lib/storage";
import { BridgeError, forget, hello, isPaired, pair, SYNC_SERVERS, syncNow } from "../lib/syncBridge";
import { REPO_URL } from "../config";
import { best } from "../lib/search";
import { href, route, setQuery } from "../lib/router";
import { account, loaded, saveAccount, server, snapshotOf, type Account, type RosterOp } from "../state";
import type { OpIndex } from "../types";

type Tab = "operators" | "depot" | "use" | "import" | "progress";

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
  const [sort, setSort] = useState(() => pref("rosterSort", "rarity"));
  const by: Record<string, (x: { r: RosterOp; op: OpIndex }, y: { r: RosterOp; op: OpIndex }) => number> = {
    rarity: (x, y) => y.op.rarity - x.op.rarity || x.op.name.localeCompare(y.op.name),
    name: (x, y) => x.op.name.localeCompare(y.op.name),
    level: (x, y) => y.r.elite - x.r.elite || y.r.level - x.r.level || x.op.name.localeCompare(y.op.name),
    masteries: (x, y) => y.r.masteries.reduce((a, b) => a + b, 0) - x.r.masteries.reduce((a, b) => a + b, 0) || y.op.rarity - x.op.rarity,
    modules: (x, y) => Object.values(y.r.modules).reduce((a, b) => a + b, 0) - Object.values(x.r.modules).reduce((a, b) => a + b, 0) || y.op.rarity - x.op.rarity,
    class: (x, y) => x.op.cls.localeCompare(y.op.cls) || y.op.rarity - x.op.rarity,
  };
  const shown = filter.trim() ? best(filter, rows, (x) => [x.op.name], 500) : rows.sort(by[sort] || by.rarity);
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
          {rows.length > 0 && <label class="field"><span>Sort</span>
            <select value={sort} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setSort(v); setPref("rosterSort", v); }}>
              <option value="rarity">Rarity</option><option value="name">Name</option><option value="level">Promotion and level</option>
              <option value="masteries">Masteries</option><option value="modules">Modules</option><option value="class">Class</option>
            </select></label>}
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
                  <td data-label="Operator"><a class="op-cell" href={href(`/operator/${op.id}`)} data-panel={op.id}><Avatar op={op} size="sm" /><span><span class="op-name">{op.name}</span><br /><Stars n={op.rarity} /></span></a></td>
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

type Msg = { ok: boolean; text: string } | null;

/** Put an import into the account; returns the sentence that says what happened. */
function apply(r: Imported, mode: "replace" | "merge"): string {
  update((acc) => ({
    ...acc, ops: mode === "replace" ? r.ops : { ...acc.ops, ...r.ops },
    depot: r.depot ? (mode === "replace" ? r.depot : { ...acc.depot, ...r.depot }) : acc.depot,
    savings: r.savings || acc.savings, consumables: r.consumables || acc.consumables, source: r.format === "Novena Sync" ? "novena-sync" : "import",
  }));
  return `Imported ${Object.keys(r.ops).length} operators${r.depot ? ` and ${Object.keys(r.depot).length} depot items` : ""} from ${r.format}${r.skipped ? ` (${r.skipped} entries skipped: unknown on this server)` : ""}.`;
}

function Import({ ops }: { ops: OpIndex[] }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [over, setOver] = useState(false);
  const s = server.value;
  const onFile = async (f: File) => {
    try {
      const r = parseRoster(JSON.parse(await f.text()), ops);
      if (r.server && r.server !== s) throw new Error(`This file is from the ${r.server.toUpperCase()} server; switch to it first (top right).`);
      setMsg({ ok: true, text: apply(r, mode) });
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
        <h2>Import a file</h2>
        <p>Accepted: a Novena roster file, a Novena Sync file, game sync data (syncData JSON), or a Krooster operator export.</p>
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
          <input type="file" accept=".json,application/json" class="sr-only"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }} />
        </label>
        {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
        <Explain>The file is read in your browser; nothing is uploaded.</Explain>
      </section>
      <section class="card">
        <h2>Export</h2>
        <p>Download this server's roster and depot as a file you can import elsewhere or keep.</p>
        <button onClick={exportIt} disabled={!Object.keys(account.value.ops).length}>Export roster</button>
      </section>
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
          <h2>Novena Sync <span class="badge">Optional app</span></h2>
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
      <p class="warn-text" style={{ margin: "10px 0 0" }}>Each sync signs you out of the game on your other devices. Play, close the game, then sync: once or twice a day is plenty.</p>
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
