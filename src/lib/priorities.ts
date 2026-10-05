// Priorities: what to raise next across the whole roster (the planner, run in a worker). It runs by itself after an
// import or a sync, and when a page that shows it finds none for the current roster, so players don't have to know to
// press a button. The last result is kept per server in this browser, so it's there straight away on the next visit.
import { effect, signal } from "@preact/signals";
import { itemsSig, metaSig } from "../components/ui";
import { costTable, goalStates, guidebook, lastPlan, rosterStates, runPlan } from "./account";
import { operators } from "./data";
import { SUPPORT_SLOTS, type PlanResult } from "./planner";
import { getItem, pref, setItem, setPref } from "./storage";
import { contentLevels, effectiveWeights } from "./weights";
import { account, hasRoster, server, targets } from "../state";

export const prioTop = signal<number>(+pref("prioTop", "20") || 20);
export const prioSupport = signal<boolean>(pref("prioSupport", "1") === "1");
export function setPrioSettings(top: number, support: boolean) {
  prioTop.value = top; prioSupport.value = support;
  setPref("prioTop", String(top)); setPref("prioSupport", support ? "1" : "");
}

/** Working: the phase it's in. */
export const prioStatus = signal<string | null>(null);
export const prioError = signal("");

/** A short fingerprint of everything the result depends on. */
export function priorityKey(): string {
  const text = JSON.stringify([server.value, account.value.ops, targets.value, prioTop.value, prioSupport.value, contentLevels.value]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${server.value}:${(h >>> 0).toString(36)}:${text.length}`;
}

/** The result for the roster as it is now, or null if it's missing or out of date. */
export const freshPriorities = (): PlanResult | null => (lastPlan.value?.key === priorityKey() ? lastPlan.value.result : null);

const whenShared = () => new Promise<void>((resolve) => {
  let done = false;
  const stop = effect(() => {
    if (!done && itemsSig.value && metaSig.value) { done = true; queueMicrotask(() => stop()); resolve(); }
  });
});

let running: Promise<void> | null = null;

export async function buildPriorities(): Promise<void> {
  if (running) return running;
  running = (async () => {
    prioError.value = "";
    prioStatus.value = "Loading the guidebook";
    try {
      await whenShared();
      const s = server.value, key = priorityKey();
      const items = itemsSig.value!, meta = metaSig.value!;
      const [book, costs, opsList] = await Promise.all([guidebook(), costTable(s), operators(s)]);
      const ops = new Map(opsList.map((o) => [o.id, o]));
      const states = rosterStates(account.value, costs);
      const result = await runPlan({
        book, costs, constTable: meta.const, values: items.values, roster: states,
        available: opsList.filter((o) => o.on.includes(s)).map((o) => o.id),
        shared: opsList.filter((o) => o.patch).map((o) => o.id),
        fixed: opsList.filter((o) => o.obtain === "is").map((o) => o.id),
        weights: effectiveWeights(),
        top: prioTop.value, support: prioSupport.value ? SUPPORT_SLOTS : 0, goals: goalStates(targets.value, states, costs, ops),
      }, (phase, done, total) => (prioStatus.value = total > 1 ? `${phase} (${done}/${total})` : phase));
      lastPlan.value = { key, result };
      void setItem(`priorities.${s}`, { key, result });
    } catch (e) {
      prioError.value = (e as Error).message;
    } finally {
      prioStatus.value = null;
      running = null;
    }
  })();
  return running;
}

/** Bring back this server's last result, then rebuild in the background if the roster has changed since. */
export async function autoPriorities(): Promise<void> {
  if (!hasRoster.value) return;
  const s = server.value;
  if (lastPlan.value?.key.split(":")[0] !== s) {
    const saved = await getItem<{ key: string; result: PlanResult }>(`priorities.${s}`);
    if (saved && server.value === s && !lastPlan.value?.key.startsWith(`${s}:`)) lastPlan.value = saved;
  }
  if (!freshPriorities() && !running) void buildPriorities();
}

let soon = 0;
/** After an edit or an import: rebuild once things have been quiet for a moment. */
export function prioritiesSoon(ms = 1500) {
  clearTimeout(soon);
  soon = window.setTimeout(() => void autoPriorities(), ms);
}
