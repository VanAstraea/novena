// Putting an import into the account, shared by the Roster's Import tab and the home page's account panel.
import { undoable } from "../components/Toast";
import { BASE } from "./data";
import { parseDepot, parseRoster, readData, type Imported } from "./importers";
import { prioritiesSoon } from "./priorities";
import { account, saveAccount, server, snapshotOf, type Account } from "../state";
import { pref, setPref } from "./storage";
import type { OpIndex } from "../types";

export function updateAccount(fn: (a: Account) => Account) {
  saveAccount(snapshotOf({ ...fn(account.value), updated: Date.now() }));
}

/** Put an import into the account; returns the sentence that says what happened. */
export function applyImport(r: Imported, mode: "replace" | "merge"): string {
  const before = account.value;
  updateAccount((acc) => ({
    ...acc, ops: mode === "replace" ? r.ops : { ...acc.ops, ...r.ops },
    depot: r.depot ? (mode === "replace" ? r.depot : { ...acc.depot, ...r.depot }) : acc.depot,
    savings: r.savings || acc.savings, consumables: r.consumables || acc.consumables, source: r.format === "Novena Sync" ? "novena-sync" : "import",
    recruit: r.recruit || acc.recruit, base: r.base || acc.base,
  }));
  if (r.sanity) syncSanity(r.sanity);
  if (Object.keys(before.ops).length && before.source !== "sample") undoable("Roster replaced with the import.", () => saveAccount(before));
  prioritiesSoon(300); // a new roster: work out what to raise next straight away
  return `Imported ${Object.keys(r.ops).length} operators${r.depot ? ` and ${Object.keys(r.depot).length} depot items` : ""} from ${r.format}${r.skipped ? ` (${r.skipped} entries skipped: unknown on this server)` : ""}.`;
}

/** Read a dropped or chosen file and import it. Throws with a readable message when it can't. */
export async function importFile(f: File, ops: OpIndex[], server: string, mode: "replace" | "merge"): Promise<string> {
  return importText(await f.text(), ops, server, mode, "Novena couldn't read that file");
}

/** Import pasted or read text (a file's contents, or a Krooster profile copied from the browser). */
export function importText(text: string, ops: OpIndex[], server: string, mode: "replace" | "merge", what = "Novena couldn't read that"): string {
  const depot = parseDepot(text);
  if (depot) return applyDepot(depot.depot, depot.format);
  let json: unknown;
  try { json = readData(text); } catch { throw new Error(`${what}. Novena reads its own roster files, Novena Sync files, game sync data and Krooster profiles.`); }
  const r = parseRoster(json, ops);
  if (r.server && r.server !== server) throw new Error(`This file is from the ${r.server.toUpperCase()} server; switch to it first (top right).`);
  return applyImport(r, mode);
}

/** Counts from another planner's depot export: each item it lists is set to its count (none: removed), the rest of
 *  the depot and the roster stay. Undoable. */
export function applyDepot(counts: Record<string, number>, format: string): string {
  const ids = Object.keys(counts);
  if (!ids.length) throw new Error("That export lists no items.");
  const before = account.value.depot;
  updateAccount((acc) => {
    const depot = { ...acc.depot };
    for (const id of ids) { if (counts[id] > 0) depot[id] = counts[id]; else delete depot[id]; }
    return { ...acc, depot };
  });
  const text = `Updated ${ids.length} items in your depot from ${format}.`;
  undoable(text, () => updateAccount((acc) => ({ ...acc, depot: before })));
  return text;
}

/** A synced sanity reading replaces the timer's when it's newer than what was typed (the notification choice stays). */
function syncSanity(x: { value: number; cap: number; at: number }) {
  const key = `sanity.${server.value}`;
  let saved: { value: number; cap: number; at: number; notify?: boolean } = { value: 0, cap: 135, at: 0 };
  try { saved = { ...saved, ...JSON.parse(pref(key, "{}")) }; } catch { /* keep the default */ }
  if (x.at > (saved.at || 0)) setPref(key, JSON.stringify({ ...saved, value: x.value, cap: x.cap, at: x.at }));
}

/** "Try it with a sample roster": a made-up mid-game account (public/sample-roster.json), marked so it's easy to leave. */
export async function loadSample(ops: OpIndex[]): Promise<void> {
  const json = await fetch(`${BASE}sample-roster.json`).then((r) => r.json());
  const r = parseRoster(json, ops);
  updateAccount((acc) => ({ ...acc, ops: r.ops, depot: r.depot || {}, source: "sample", snapshots: [], recruit: undefined, base: undefined, consumables: undefined }));
  prioritiesSoon(300);
}

/** Leave the sample: back to an empty account for this server. */
export function clearSample(): void {
  saveAccount({ ...account.value, ops: {}, depot: {}, source: undefined, snapshots: [], recruit: undefined, base: undefined, consumables: undefined, updated: Date.now() });
}
