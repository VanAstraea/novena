// Shared by the Planner, Farming and the account pages: turn typed targets into states and costs.
import type { Meta, OpDetail, OpIndex } from "../types";
import type { PlanTarget, RosterOp } from "../state";
import { parse, reach, reached, type Target } from "./build";
import { add, fresh, stateCost, type Cost, type OpState } from "./costs";
import { fold } from "./format";
import { matchScore } from "./search";

export function findOp(name: string, ops: OpIndex[]): OpIndex | null {
  const f = fold(name).trim();
  if (!f) return null;
  const exact = ops.find((o) => fold(o.name) === f || (o.cn && fold(o.cn) === f) || (o.alt && fold(o.alt) === f));
  if (exact) return exact;
  let best: OpIndex | null = null;
  let score = 0;
  for (const o of ops) {
    const s = Math.max(matchScore(name, o.name), o.cn ? matchScore(name, o.cn) : 0);
    if (s > score) { score = s; best = o; }
  }
  return score >= 55 ? best : null;
}

export const stateOf = (r: RosterOp | undefined, d: OpDetail): OpState =>
  r ? { elite: r.elite, level: r.level, skillLevel: r.skillLevel, masteries: d.skills.map((_, i) => r.masteries[i] || 0), modules: { ...r.modules } } : fresh(d);

export interface PlannedTarget {
  t: PlanTarget;
  op: OpIndex;
  d: OpDetail;
  target: Target;
  from: OpState;
  to: OpState | null;
  cost: Cost;
  error?: string;
  done: boolean;
}

export function planTarget(t: PlanTarget, op: OpIndex, d: OpDetail, meta: Meta, roster: Record<string, RosterOp>): PlannedTarget {
  const from = stateOf(roster[op.id], d);
  try {
    const { target } = parse(t.text);
    const to = reach(d, op.rarity, op.name, from, target);
    return { t, op, d, target, from, to, cost: stateCost(d, meta.const, from, to), done: reached(from, to) };
  } catch (e) {
    return { t, op, d, target: { elite: 0, level: 0, skillLevel: 0, masteries: {}, modules: {} }, from, to: null, cost: {}, error: (e as Error).message, done: false };
  }
}

export const totalCost = (rows: { cost: Cost }[]): Cost => rows.reduce<Cost>((acc, r) => add(acc, r.cost), {});

/** "char_x:E2 L90 S2M3;char_y:SL7" <-> targets, for shareable planner links. */
export const encodeTargets = (ts: PlanTarget[]) => ts.map((t) => `${t.id}:${t.text}`).join(";");
export function decodeTargets(s: string | null): PlanTarget[] | null {
  if (!s) return null;
  return s.split(";").map((p) => {
    const i = p.indexOf(":");
    return i > 0 ? { id: p.slice(0, i), text: p.slice(i + 1) } : null;
  }).filter(Boolean) as PlanTarget[];
}
