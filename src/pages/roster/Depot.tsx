// The roster's Depot tab: screenshots, a paste from another planner, and every item by hand.
import { useState } from "preact/hooks";
import { DepotImport } from "../../components/DepotImport";
import { Explain, GuideLink, ItemIcon, itemsSig } from "../../components/ui";
import { applyDepot, updateAccount as update } from "../../lib/accountImport";
import { parseDepot } from "../../lib/importers";
import { account } from "../../state";

export type Msg = { ok: boolean; text: string } | null;

export function Depot() {
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
