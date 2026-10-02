// Upgrade cost model (ported from ako's costs.py): what it costs to move an operator between two states.
// A cost maps item id -> count. LMD is item "4001" as in the game tables; operator EXP is the pseudo-item "EXP".
import type { ItemList, Meta, OpDetail } from "../types";

export const LMD = "4001";
export const EXP = "EXP";
export type Cost = Record<string, number>;
export type Const = Meta["const"];

export interface OpState {
  elite: number;
  level: number;
  skillLevel: number; // 1-7
  masteries: number[]; // per skill
  modules: Record<string, number>; // letter -> stage
}

export const fresh = (d: OpDetail): OpState => ({
  elite: 0, level: 1, skillLevel: 1, masteries: d.skills.map(() => 0), modules: {},
});

export function add(into: Cost, more: Cost | ItemList, times = 1): Cost {
  const entries = Array.isArray(more) ? more : Object.entries(more);
  for (const [id, n] of entries) {
    if (!n) continue;
    into[id] = (into[id] || 0) + n * times;
    if (!into[id]) delete into[id];
  }
  return into;
}

export const sum = (...costs: (Cost | ItemList)[]): Cost => costs.reduce<Cost>((acc, c) => add(acc, c), {});

export function levelCost(c: Const, elite: number, from: number, to: number): Cost {
  let exp = 0;
  let lmd = 0;
  for (let i = from - 1; i < to - 1; i++) {
    exp += c.expMap[elite][i] ?? 0;
    lmd += c.lmdMap[elite][i] ?? 0;
  }
  const out: Cost = {};
  if (exp) out[EXP] = exp;
  if (lmd) out[LMD] = lmd;
  return out;
}

export function promotionCost(d: OpDetail, toElite: number): Cost {
  const p = d.phases[toElite];
  return add(sum(p.cost), { [LMD]: Math.max(p.lmd, 0) });
}

/** Levels and promotions from (E, L) to (E', L'), levelling to the cap before each promotion. */
export function growthCost(d: OpDetail, c: Const, fromE: number, fromL: number, toE: number, toL: number): Cost {
  if (toE < fromE || (toE === fromE && toL <= fromL)) return {};
  const caps = d.phases.map((p) => p.max);
  if (fromE === toE) return levelCost(c, fromE, fromL, toL);
  const cost = levelCost(c, fromE, fromL, caps[fromE]);
  for (let e = fromE + 1; e <= toE; e++) {
    add(cost, promotionCost(d, e));
    add(cost, levelCost(c, e, 1, e < toE ? caps[e] : toL));
  }
  return cost;
}

/** Shared skill level 1-7. skillUp[i] upgrades level i+1 -> i+2. */
export function skillLevelCost(d: OpDetail, from: number, to: number): Cost {
  const out: Cost = {};
  for (let i = from - 1; i < Math.min(to - 1, d.skillUp.length); i++) add(out, d.skillUp[i]);
  return out;
}

export function masteryCost(d: OpDetail, skill: number, from: number, to: number): Cost {
  const steps = d.skills[skill]?.mastery || [];
  const out: Cost = {};
  for (let m = from; m < Math.min(to, steps.length); m++) add(out, steps[m].cost);
  return out;
}

export function moduleCost(d: OpDetail, letter: string, from: number, to: number): Cost {
  const m = d.modules.find((x) => x.letter === letter);
  const out: Cost = {};
  if (!m) return out;
  for (let s = from + 1; s <= to; s++) add(out, m.cost[s - 1] || []);
  return out;
}

/** Everything between two states of one operator. Parts already reached cost nothing. */
export function stateCost(d: OpDetail, c: Const, from: OpState, to: OpState, sharedGrowth = false): Cost {
  const out: Cost = {};
  if (!sharedGrowth) {
    add(out, growthCost(d, c, from.elite, from.level, to.elite, to.level));
    add(out, skillLevelCost(d, from.skillLevel, to.skillLevel));
  }
  to.masteries.forEach((m, i) => add(out, masteryCost(d, i, from.masteries[i] || 0, m)));
  for (const [letter, stage] of Object.entries(to.modules)) add(out, moduleCost(d, letter, from.modules[letter] || 0, stage));
  return out;
}

/** Sanity-equivalent of a cost, from item values. Unvalued items count 0. */
export function sanity(cost: Cost, values: Record<string, number>): number {
  return Object.entries(cost).reduce((s, [id, n]) => s + (values[id] || 0) * n, 0);
}
