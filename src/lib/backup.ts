// The single-file backup on Settings & backup: everything Novena saved in this browser, and nothing else.
//
//   data   what's kept in IndexedDB (rosters, depots, planner targets, per-server settings), as values
//   raw    the small choices kept in local storage only (tier lists, base levels and pins, leave-out lists,
//          weights, timers…), as the exact text saved; new in version 2
//
// Version 1 files have no `raw`: their local storage entries are in `data`, read as JSON, so they're written back as
// JSON text, which is what they were. The pairing key for Novena Sync stays out: it belongs to this computer.
import { keys, getItem, setItem, setPref } from "./storage";

export const BACKUP_APP = "novena";
const OLD_BACKUP_APPS = ["doctors-toolkit"]; // the working title, before the name Novena
const STORED = /^(account|targets|prefs)\.(en|jp|kr|cn)$/; // kept in IndexedDB as well
const NEVER = /^(syncKey|priorities\..*)$/; // this computer's pairing key; a cache rebuilt on its own
const NAME = /^[A-Za-z][\w.-]{0,60}$/;

export interface Backup { app: string; version: number; exported: string; data: Record<string, unknown>; raw?: Record<string, string> }

/** Local storage entries Novena wrote, by name without the "novena." prefix. */
function localEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k?.startsWith("novena.") ? localStorage.getItem(k) : null;
      if (k && v !== null) out[k.slice(7)] = v;
    }
  } catch { /* blocked */ }
  return out;
}

export async function makeBackup(): Promise<Backup> {
  const data: Record<string, unknown> = {};
  const raw: Record<string, string> = {};
  const local = localEntries();
  for (const k of await keys()) {
    if (NEVER.test(k)) continue;
    if (STORED.test(k)) data[k] = await getItem(k);
  }
  for (const [k, v] of Object.entries(local)) if (!STORED.test(k) && !NEVER.test(k)) raw[k] = v;
  return { app: BACKUP_APP, version: 2, exported: new Date().toISOString(), data, raw };
}

/** Writes a backup back. Returns how many entries it restored; throws if the file isn't a Novena backup. */
export async function restoreBackup(b: unknown): Promise<number> {
  const f = b as Partial<Backup> | null;
  if (!f || (f.app !== BACKUP_APP && !OLD_BACKUP_APPS.includes(f.app as string)) || !f.data || typeof f.data !== "object") {
    throw new Error("That isn't a Novena backup file.");
  }
  let n = 0;
  for (const [k, v] of Object.entries(f.data)) {
    if (STORED.test(k)) { await setItem(k, v); n++; }
    else if (!f.raw && NAME.test(k) && !NEVER.test(k) && v !== undefined) { setPref(k, JSON.stringify(v)); n++; } // version 1
  }
  for (const [k, v] of Object.entries(f.raw && typeof f.raw === "object" ? f.raw : {})) {
    if (NAME.test(k) && !NEVER.test(k) && !STORED.test(k) && typeof v === "string") { setPref(k, v); n++; }
  }
  return n;
}
