// The account at a glance (Today): counts from the roster, what it has cost so far, and what it would cost to take every
// owned operator all the way. Everything is priced with the game's own tables (costs.ts); alternate forms share their
// base form's promotion, level and skill level, so those are counted once, as on What changed.
import type { RosterOp } from "../state";
import type { OpIndex } from "../types";
import { add, EXP, fresh, growthCost, LMD, masteryCost, moduleCost, sanity, skillLevelCost, stateCost, type Const, type Cost, type CostData, type OpState } from "./costs";

export type Band = "6" | "5" | "4" | "low";
export const BANDS: Band[] = ["6", "5", "4", "low"];
export const BAND_NAMES: Record<Band, string> = { 6: "6★", 5: "5★", 4: "4★", low: "3★ and below" };
export const band = (rarity: number): Band => (rarity >= 6 ? "6" : rarity === 5 ? "5" : rarity === 4 ? "4" : "low");

export interface AccountStats {
  owned: number;
  byBand: Record<Band, number>;
  e2: number;
  levelMax: number; // at their last promotion and its level cap
  sl7: number;
  m3: number; // M3 skills, all operators together
  m3Ops: number; // operators with at least one
  modules: number; // modules unlocked (stage 1 or more)
  modules3: number;
  pot6: number;
  invested: Cost; // E0 L1 to where each operator is now
}

const stateOf = (r: RosterOp, d: CostData): OpState => ({
  elite: r.elite, level: r.level, skillLevel: r.skillLevel, masteries: d.skills.map((_, i) => r.masteries[i] || 0),
  modules: Object.fromEntries(d.modules.map((m) => [m.letter, r.modules[m.letter] || 0])),
});

/** The top promotion and its level cap, from the cost table, else the game's caps by rarity. */
function topOf(rarity: number, d: CostData | undefined, c: Const): [number, number] {
  if (d?.phases.length) return [d.phases.length - 1, d.phases[d.phases.length - 1].max];
  const caps = (c.maxLevel[rarity - 1] || [30]).filter((x) => x > 0);
  return [caps.length - 1, caps[caps.length - 1]];
}

export function accountStats(roster: RosterOp[], ops: Map<string, OpIndex>, costs: Record<string, CostData>, c: Const): AccountStats {
  const s: AccountStats = { owned: 0, byBand: { 6: 0, 5: 0, 4: 0, low: 0 }, e2: 0, levelMax: 0, sl7: 0, m3: 0, m3Ops: 0, modules: 0, modules3: 0, pot6: 0, invested: {} };
  for (const r of roster) {
    const op = ops.get(r.id);
    const d = costs[r.id];
    const alt = !!op?.patch;
    if (!alt) { // an alternate form is the same operator: count it once
      s.owned++;
      if (op) s.byBand[band(op.rarity)]++;
      if (r.elite >= 2) s.e2++;
      const [e, l] = topOf(op?.rarity || 1, d, c);
      if (r.elite >= e && r.level >= l) s.levelMax++;
      if (r.skillLevel >= 7) s.sl7++;
      if (r.pot >= 6) s.pot6++;
    }
    const m3 = r.masteries.filter((m) => m >= 3).length;
    s.m3 += m3;
    if (m3) s.m3Ops++;
    const mods = Object.values(r.modules);
    s.modules += mods.filter((m) => m > 0).length;
    s.modules3 += mods.filter((m) => m >= 3).length;
    if (d) add(s.invested, stateCost(d, c, fresh(d), stateOf(r, d), alt));
  }
  return s;
}

/** The parts of "max" the cost to max everything can count. */
export type Part = "growth" | "skills" | "masteries" | "modules";
export const PARTS: Part[] = ["growth", "skills", "masteries", "modules"];

export interface MaxRow { id: string; rarity: number; parts: Record<Part, Cost> }

/** What each owned operator still needs to reach its top promotion at max level, skill level 7, M3 on every skill and
 *  every module at stage 3, part by part. Operators missing from the cost table are left out. */
export function maxRows(roster: RosterOp[], ops: Map<string, OpIndex>, costs: Record<string, CostData>, c: Const): MaxRow[] {
  const out: MaxRow[] = [];
  for (const r of roster) {
    const d = costs[r.id];
    const op = ops.get(r.id);
    if (!d || !op) continue;
    const now = stateOf(r, d);
    const alt = !!op.patch;
    const [e, l] = topOf(op.rarity, d, c);
    const masteries: Cost = {};
    d.skills.forEach((sk, i) => add(masteries, masteryCost(d, i, now.masteries[i], sk.mastery.length)));
    const modules: Cost = {};
    for (const m of d.modules) add(modules, moduleCost(d, m.letter, now.modules[m.letter], m.cost.length));
    out.push({
      id: r.id, rarity: op.rarity,
      parts: {
        growth: alt ? {} : growthCost(d, c, now.elite, now.level, e, l),
        skills: alt ? {} : skillLevelCost(d, now.skillLevel, d.skillUp.length + 1),
        masteries, modules,
      },
    });
  }
  return out;
}

export interface MaxTotal { cost: Cost; toRaise: number; counted: number }

/** The total of the chosen parts over the operators in the chosen rarity bands. */
export function maxTotal(rows: MaxRow[], parts: Part[], bands: Band[]): MaxTotal {
  const cost: Cost = {};
  let toRaise = 0, counted = 0;
  for (const r of rows) {
    if (!bands.includes(band(r.rarity))) continue;
    counted++;
    let any = false;
    for (const p of parts) if (Object.keys(r.parts[p]).length) { add(cost, r.parts[p]); any = true; }
    if (any) toRaise++;
  }
  return { cost, toRaise, counted };
}

/** The materials of a cost (no LMD or EXP), worth the most sanity first, at most `n` of them. */
export function topMaterials(cost: Cost, values: Record<string, number>, n: number): [string, number][] {
  return Object.entries(cost).filter(([id, k]) => id !== LMD && id !== EXP && k > 0)
    .sort((a, b) => (values[b[0]] || 0) * b[1] - (values[a[0]] || 0) * a[1] || b[1] - a[1]).slice(0, n);
}

/** LMD, EXP and the sanity a cost is worth (materials, LMD and EXP all valued). */
export const summary = (cost: Cost, values: Record<string, number>) => ({ lmd: cost[LMD] || 0, exp: cost[EXP] || 0, sanity: sanity(cost, values) });
