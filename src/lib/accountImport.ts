// Putting an import into the account, shared by the Roster's Import tab and the home page's account panel.
import { parseRoster, type Imported } from "./importers";
import { prioritiesSoon } from "./priorities";
import { account, saveAccount, server, snapshotOf, type Account } from "../state";
import { pref, setPref } from "./storage";
import type { OpIndex } from "../types";

export function updateAccount(fn: (a: Account) => Account) {
  saveAccount(snapshotOf({ ...fn(account.value), updated: Date.now() }));
}

/** Put an import into the account; returns the sentence that says what happened. */
export function applyImport(r: Imported, mode: "replace" | "merge"): string {
  updateAccount((acc) => ({
    ...acc, ops: mode === "replace" ? r.ops : { ...acc.ops, ...r.ops },
    depot: r.depot ? (mode === "replace" ? r.depot : { ...acc.depot, ...r.depot }) : acc.depot,
    savings: r.savings || acc.savings, consumables: r.consumables || acc.consumables, source: r.format === "Novena Sync" ? "novena-sync" : "import",
    recruit: r.recruit || acc.recruit, base: r.base || acc.base,
  }));
  if (r.sanity) syncSanity(r.sanity);
  prioritiesSoon(300); // a new roster: work out what to raise next straight away
  return `Imported ${Object.keys(r.ops).length} operators${r.depot ? ` and ${Object.keys(r.depot).length} depot items` : ""} from ${r.format}${r.skipped ? ` (${r.skipped} entries skipped: unknown on this server)` : ""}.`;
}

/** Read a dropped or chosen file and import it. Throws with a readable message when it can't. */
export async function importFile(f: File, ops: OpIndex[], server: string, mode: "replace" | "merge"): Promise<string> {
  let json: unknown;
  try { json = JSON.parse(await f.text()); } catch { throw new Error("That file isn't JSON. Novena reads roster files, Novena Sync files, game sync data and Krooster exports."); }
  const r = parseRoster(json, ops);
  if (r.server && r.server !== server) throw new Error(`This file is from the ${r.server.toUpperCase()} server; switch to it first (top right).`);
  return applyImport(r, mode);
}

/** A synced sanity reading replaces the timer's when it's newer than what was typed (the notification choice stays). */
function syncSanity(x: { value: number; cap: number; at: number }) {
  const key = `sanity.${server.value}`;
  let saved: { value: number; cap: number; at: number; notify?: boolean } = { value: 0, cap: 135, at: 0 };
  try { saved = { ...saved, ...JSON.parse(pref(key, "{}")) }; } catch { /* keep the default */ }
  if (x.at > (saved.at || 0)) setPref(key, JSON.stringify({ ...saved, value: x.value, cap: x.cap, at: x.at }));
}
