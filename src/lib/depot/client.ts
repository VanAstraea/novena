// Main-thread side of depot recognition: one worker, prepared once per server, screenshots queued through it.
import type { ItemsFile } from "../../types";
import type { Slot } from "./recognize";

export type { Slot };

let worker: Worker | null = null;
let readyFor: string | null = null;
let ready: Promise<number> | null = null;
const waiting = new Map<string, { resolve: (r: { slots: Slot[]; width: number; height: number }) => void; reject: (e: Error) => void }>();
let onProgress: ((step: string) => void) | null = null;

/** Items the depot screenshots are read for: materials, chips, skill summaries, module items, battle records and the
 *  like. Not the items listed only for other views (sanity potions, training vouchers, potential tokens, event items),
 *  which the game shows elsewhere and whose icons would only slow recognition down. */
export function depotItems(items: ItemsFile): [string, ItemsFile["items"][string]][] {
  const tokens = new Set(Object.values(items.potential || {}).flatMap((t) => Object.values(t)));
  return Object.entries(items.items).filter(([id, it]) => ["material", "chip", "skill", "module", "exp", "other"].includes(it.group)
    && id !== "EXP" && id !== "4001" && !tokens.has(id) && !/^(AP_SUPPLY|VOUCHER_|ACTIVITY_ITEM)/.test(it.type || ""));
}

export function recognisable(items: ItemsFile) {
  return depotItems(items).map(([id, it]) => ({ id, icon: it.icon, rarity: Math.min(Math.max(it.rarity, 1), 6), sort: it.sort }));
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress?.(m.step);
      else if (m.type === "result") { waiting.get(m.key)?.resolve(m); waiting.delete(m.key); }
      else if (m.type === "error" && m.key) { waiting.get(m.key)?.reject(new Error(m.message)); waiting.delete(m.key); }
    };
  }
  return worker;
}

export function prepare(server: string, items: ItemsFile, progress: (step: string) => void): Promise<number> {
  onProgress = progress;
  if (ready && readyFor === server) return ready;
  const w = getWorker();
  const list = recognisable(items);
  const order = [...list].sort((a, b) => a.sort - b.sort).map((x) => x.id);
  readyFor = server;
  ready = new Promise<number>((resolve, reject) => {
    const listen = (e: MessageEvent) => {
      if (e.data.type === "ready") { w.removeEventListener("message", listen); resolve(e.data.count); }
      else if (e.data.type === "error" && !e.data.key) { w.removeEventListener("message", listen); reject(new Error(e.data.message)); }
    };
    w.addEventListener("message", listen);
    w.postMessage({ type: "init", items: list, order });
  });
  ready.catch(() => { ready = null; readyFor = null; });
  return ready;
}

let seq = 0;
export async function recognize(file: Blob, progress: (step: string) => void): Promise<{ slots: Slot[]; width: number; height: number }> {
  onProgress = progress;
  const w = getWorker();
  const key = `s${++seq}`;
  const image = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    waiting.set(key, { resolve, reject });
    w.postMessage({ type: "recognize", key, image }, [image]);
  });
}
