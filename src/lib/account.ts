// Account-wide inputs the v2 pages share: the guidebook, cost tables, the planner run and community builds.
import { signal } from "@preact/signals";
import type { Server } from "../types";
import { load } from "./data";
import { parse, reach } from "./build";
import type { Const, CostData, OpState } from "./costs";
import type { GuidebookFile, PlanInput, PlanResult } from "./planner";
import type { Account, PlanTarget } from "../state";
import type { OpIndex, UsageFile } from "../types";

// kept as published: the planner's worker unpacks it, and a few flat arrays are much quicker to hand over than 40k rows
export const guidebook = () => load<GuidebookFile>("common/guidebook.json");
export const costTable = (s: Server) => load<Record<string, CostData>>(`${s}/costs.json`);

export function rosterStates(a: Account, costs: Record<string, CostData>): Record<string, OpState> {
  const out: Record<string, OpState> = {};
  for (const r of Object.values(a.ops)) {
    const c = costs[r.id];
    if (!c) continue;
    out[r.id] = {
      elite: r.elite, level: r.level, skillLevel: r.skillLevel, masteries: c.skills.map((_, i) => r.masteries[i] || 0),
      modules: Object.fromEntries(c.modules.map((m) => [m.letter, r.modules[m.letter] || 0])),
    };
  }
  return out;
}

/** Planner targets of owned operators as goal states (targets that can't be reached are skipped). */
export function goalStates(targets: PlanTarget[], states: Record<string, OpState>, costs: Record<string, CostData>, ops: Map<string, OpIndex>): Record<string, OpState> {
  const out: Record<string, OpState> = {};
  for (const t of targets) {
    const from = out[t.id] || states[t.id];
    const op = ops.get(t.id);
    if (!from || !op || !costs[t.id]) continue;
    try {
      out[t.id] = reach(costs[t.id], op.rarity, op.name, from, parse(t.text).target);
    } catch { /* unreachable target: shown as an error on the Planner */ }
  }
  return out;
}

/** The community build (E2, main skill M3, main module) as a target state from `from`, or null. */
export function communityState(op: OpIndex, usage: UsageFile, costs: CostData, from: OpState): OpState | null {
  const b = usage.ops[op.id]?.build;
  if (!b) return null;
  const parts = [b.elite ? `E${b.elite}` : "", b.skill && b.mastery ? `S${b.skill}M${b.mastery}` : "",
    b.module && costs.modules.some((m) => m.letter === b.module) ? `Mod ${b.module}1` : ""].filter(Boolean);
  if (!parts.length) return null;
  try {
    return reach(costs, op.rarity, op.name, from, parse(parts.join(" ")).target);
  } catch {
    return null;
  }
}

/** The last plan built this session (kept so switching pages doesn't throw it away; the Sanity Dump reads it). */
export const lastPlan = signal<{ key: string; result: PlanResult } | null>(null);

let worker: Worker | null = null;

/** Run the planner in a worker. `onProgress` gets phase updates; resolves with the plan. */
export function runPlan(input: PlanInput, onProgress: (phase: string, done: number, total: number) => void): Promise<PlanResult> {
  worker?.terminate();
  const w = (worker = new Worker(new URL("./planWorker.ts", import.meta.url), { type: "module" }));
  return new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.phase, m.done, m.total);
      else if (m.type === "done") { resolve(m.result); w.terminate(); }
      else { reject(new Error(m.message)); w.terminate(); }
    };
    w.onerror = (e) => { reject(new Error(e.message || "The planner stopped unexpectedly")); w.terminate(); };
    w.postMessage(input);
  });
}

export type { Const };
