// Everything the user enters stays in this browser: IndexedDB when it's available, localStorage otherwise, and
// memory if both are blocked (private windows). Nothing here is ever sent anywhere.

const DB = "doctors-toolkit";
const STORE = "kv";
let dbp: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (db) {
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
    } catch { /* fall through */ }
  }
  try {
    const raw = localStorage.getItem(`dtk.${key}`);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch { /* blocked */ }
  return memory.get(key) as T | undefined;
}

export async function setItem(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await open();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    } catch { /* fall through */ }
  }
  try {
    localStorage.setItem(`dtk.${key}`, JSON.stringify(value));
  } catch { /* blocked or full: memory only */ }
}

export async function keys(): Promise<string[]> {
  const db = await open();
  const out = new Set<string>(memory.keys());
  if (db) {
    try {
      const all = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      all.forEach((k) => out.add(String(k)));
    } catch { /* ignore */ }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("dtk.") && k !== "dtk.theme") out.add(k.slice(4));
    }
  } catch { /* blocked */ }
  return [...out];
}

export async function clearAll(): Promise<void> {
  memory.clear();
  const db = await open();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("dtk.")) localStorage.removeItem(k);
  } catch { /* blocked */ }
}

/** Small synchronous preferences (theme, server, last tab). */
export function pref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`dtk.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: string): void {
  try {
    localStorage.setItem(`dtk.${key}`, value);
  } catch { /* blocked */ }
}
