// Import the depot from screenshots: read in this browser, reviewed by the user, then applied. Nothing is uploaded.
import { useEffect, useRef, useState } from "preact/hooks";
import { prepare, recognize, type Slot } from "../lib/depot/client";
import { fmt } from "../lib/format";
import { account, saveAccount, server, snapshotOf } from "../state";
import { Explain, ItemIcon, itemsSig } from "./ui";

interface Shot { name: string; url: string; width: number; height: number }
interface Row { key: string; shot: number; slot: Slot; id: string; count: number; include: boolean; dupes: number }

const THUMB = 52;

export function DepotImport() {
  const items = itemsSig.value;
  const [shots, setShots] = useState<Shot[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<Record<string, number> | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const handle = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || !items) return;
    setBusy(true);
    setError("");
    setUndo(null);
    try {
      setStatus("Preparing item pictures (the first time takes a few seconds)…");
      await prepare(server.value, items, setStatus);
      const newShots: Shot[] = [];
      const newRows: Row[] = [];
      for (const [n, f] of images.entries()) {
        setStatus(`Reading screenshot ${n + 1} of ${images.length}…`);
        const r = await recognize(f, (step) => setStatus(`Screenshot ${n + 1} of ${images.length}: ${step.toLowerCase()}…`));
        const shot = shots.length + newShots.length;
        newShots.push({ name: f.name || `pasted ${n + 1}`, url: URL.createObjectURL(f), width: r.width, height: r.height });
        for (const slot of r.slots) {
          newRows.push({ key: `${shot}-${slot.row}-${slot.col}`, shot, slot, id: slot.id || "", count: slot.count, include: slot.trusted && !!slot.id, dupes: 1 });
        }
      }
      setShots([...shots, ...newShots]);
      setRows(merge([...rows, ...newRows]));
      setStatus("");
    } catch (e) {
      setError(`Couldn't read the screenshot: ${(e as Error).message}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  // paste a screenshot straight from the clipboard (Win+Shift+S / Cmd+Shift+4, then Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void handle(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include && r.id);
  const unsure = rows.filter((r) => !r.slot.trusted || r.slot.countUnsure);

  const apply = () => {
    const before: Record<string, number> = {};
    const depot = { ...account.value.depot };
    for (const r of chosen) {
      before[r.id] = depot[r.id] || 0;
      if (r.count > 0) depot[r.id] = r.count; else delete depot[r.id];
    }
    saveAccount(snapshotOf({ ...account.value, depot, updated: Date.now() }));
    setUndo(before);
    setRows([]);
    setShots([]);
    setStatus(`Updated ${chosen.length} items in your depot.`);
  };

  const revert = () => {
    if (!undo) return;
    const depot = { ...account.value.depot };
    for (const [id, n] of Object.entries(undo)) { if (n > 0) depot[id] = n; else delete depot[id]; }
    saveAccount({ ...account.value, depot, updated: Date.now() });
    setUndo(null);
    setStatus("Undone: your depot is back to how it was.");
  };

  if (!items) return null;
  const all = Object.entries(items.items).filter(([id, it]) => ["material", "chip", "skill", "module", "exp", "other"].includes(it.group) && id !== "EXP" && id !== "4001")
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <section class="card">
      <h2>Import from screenshots</h2>
      <ol style={{ paddingLeft: "1.3em", margin: "0 0 10px" }}>
        <li>In the game, open the <strong>Depot</strong> and pick <strong>Growth Materials</strong> (or <strong>All</strong>).</li>
        <li>Take a screenshot, scroll so new items show, take another. Overlap is fine; take as many as you need.</li>
        <li>Drop them here, choose them, or paste one with <kbd>Ctrl</kbd>+<kbd>V</kbd>. Check what was read, then apply.</li>
      </ol>
      <div class={`dropzone${drag ? " over" : ""}`} role="button" tabIndex={0} aria-label="Choose depot screenshots"
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle([...(e.dataTransfer?.files || [])]); }}>
        {busy ? <span role="status">{status}</span> : <span><strong>Drop screenshots here</strong> or click to choose · paste with Ctrl+V</span>}
        <input ref={input} type="file" accept="image/*" multiple class="sr-only" tabIndex={-1}
          onChange={(e) => { const f = [...((e.target as HTMLInputElement).files || [])]; (e.target as HTMLInputElement).value = ""; void handle(f); }} />
      </div>
      {!busy && status && <p role="status" class="good-text" style={{ marginTop: "8px" }}>{status} {undo && <button class="small" onClick={revert}>Undo</button>}</p>}
      {error && <p role="alert" class="bad-text" style={{ marginTop: "8px" }}>{error}</p>}
      <Explain>Screenshots are read on your device by an image-matching library (Arknights Toolbox's open-source depot recogniser); they're never uploaded. It doesn't touch the game: you take the screenshots yourself.</Explain>

      {rows.length > 0 && (
        <>
          <div class="row" style={{ justifyContent: "space-between", marginTop: "12px" }}>
            <p style={{ margin: 0 }}>Found <strong>{rows.length}</strong> items{unsure.length ? <> · <span class="warn-text">{unsure.length} to check</span> (unticked until you confirm)</> : null}.</p>
            <div class="row">
              <button class="ghost small" onClick={() => { setRows([]); setShots([]); }}>Discard</button>
              <button class="primary" onClick={apply} disabled={!chosen.length}>Update {chosen.length} items in my depot</button>
            </div>
          </div>
          <div class="table-wrap" style={{ marginTop: "8px" }}>
            <table class="cards">
              <thead><tr><th>Use</th><th>Screenshot</th><th>Item</th><th class="num">Count</th><th>Now in depot</th></tr></thead>
              <tbody>
                {[...unsure, ...rows.filter((r) => !unsure.includes(r))].map((r) => {
                  const s = shots[r.shot];
                  const k = THUMB / r.slot.box.size;
                  const check = !r.slot.trusted || r.slot.countUnsure;
                  return (
                    <tr key={r.key} style={check ? { background: "color-mix(in srgb, var(--warn) 10%, transparent)" } : undefined}>
                      <td data-label="Use"><input type="checkbox" checked={r.include} aria-label={`Use ${items.items[r.id]?.name || "this item"}`}
                        onChange={(e) => update(r.key, { include: (e.target as HTMLInputElement).checked })} /></td>
                      <td data-label="Screenshot">
                        {s && <span role="img" aria-label="Crop of the screenshot" style={{
                          display: "inline-block", width: `${THUMB}px`, height: `${THUMB}px`, borderRadius: "8px",
                          backgroundImage: `url(${s.url})`, backgroundSize: `${s.width * k}px ${s.height * k}px`,
                          backgroundPosition: `-${r.slot.box.x * k}px -${r.slot.box.y * k}px`,
                        }} />}
                        {check && <><br /><small class="warn-text">{!r.slot.trusted ? "Check the item" : "Check the count"}</small></>}
                      </td>
                      <td data-label="Item">
                        <select value={r.id} aria-label="Item" onChange={(e) => update(r.key, { id: (e.target as HTMLSelectElement).value, include: true })}>
                          {!r.id && <option value="">Not sure: pick the item</option>}
                          {[r.slot.id, ...r.slot.alternatives].filter((x): x is string => !!x).map((id) => <option key={`a${id}`} value={id}>{items.items[id]?.name || id}</option>)}
                          <option disabled>──────────</option>
                          {all.map(([id, it]) => <option key={id} value={id}>{it.name}</option>)}
                        </select>
                        {r.dupes > 1 && <><br /><small class="muted">in {r.dupes} screenshots</small></>}
                      </td>
                      <td data-label="Count" class="num"><input type="number" min={0} value={r.count} aria-label="Count"
                        onChange={(e) => update(r.key, { count: Math.max(0, +(e.target as HTMLInputElement).value || 0), include: true })} /></td>
                      <td data-label="Now in depot">{r.id ? <ItemIcon id={r.id} count={account.value.depot[r.id] || 0} /> : "–"} {r.id && (account.value.depot[r.id] || 0) !== r.count && <small class="muted">→ {fmt(r.count)}</small>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** One row per item: the same item seen in overlapping screenshots keeps its most confident reading. */
function merge(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  const out: Row[] = [];
  for (const r of rows) {
    if (!r.id || !r.slot.trusted) { out.push(r); continue; }
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); out.push(r); continue; }
    prev.dupes++;
    if (r.slot.diff < prev.slot.diff && !r.slot.countUnsure) Object.assign(prev, { ...r, dupes: prev.dupes, key: prev.key });
  }
  return out;
}
