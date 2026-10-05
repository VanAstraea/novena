// What changed between two rosters, and exactly what it cost (ported from ako's progress.py): promotions and levels,
// skill levels, masteries and modules, each priced with the game's own costs. Alternate forms share their base form's
// promotion, level and skill level, so those are booked once.
import type { RosterOp } from "../state";
import type { OpIndex } from "../types";
import { add, growthCost, masteryCost, moduleCost, skillLevelCost, type Const, type Cost, type CostData } from "./costs";

export interface Change {
  id: string;
  kind: "new" | "growth" | "skill" | "mastery" | "module" | "potential";
  before: string;
  after: string;
  cost: Cost;
}

export interface Progress { changes: Change[]; spent: Cost; depot: Record<string, number> }

const blank = (id: string, d?: CostData): RosterOp => ({ id, elite: 0, level: 1, pot: 1, skillLevel: 1, masteries: (d?.skills || []).map(() => 0), modules: {} });

export function operatorChanges(old: RosterOp | undefined, now: RosterOp, d: CostData | undefined, c: Const, alt: boolean): Change[] {
  const out: Change[] = [];
  const id = now.id;
  if (!old) out.push({ id, kind: "new", before: "–", after: "joined", cost: {} });
  const was = old || blank(id, d);
  if (!d) return out;
  if (!alt && (now.elite !== was.elite || now.level !== was.level)) {
    out.push({ id, kind: "growth", before: `E${was.elite} L${was.level}`, after: `E${now.elite} L${now.level}`, cost: growthCost(d, c, was.elite, was.level, now.elite, now.level) });
  }
  if (!alt && now.skillLevel !== was.skillLevel) {
    out.push({ id, kind: "skill", before: `SL${was.skillLevel}`, after: `SL${now.skillLevel}`, cost: skillLevelCost(d, was.skillLevel, now.skillLevel) });
  }
  if (!alt && now.pot !== was.pot && old) out.push({ id, kind: "potential", before: `P${was.pot}`, after: `P${now.pot}`, cost: {} });
  now.masteries.forEach((m, i) => {
    const before = was.masteries[i] || 0;
    if (m !== before) out.push({ id, kind: "mastery", before: `S${i + 1} M${before}`, after: `S${i + 1} M${m}`, cost: masteryCost(d, i, before, m) });
  });
  for (const [letter, stage] of Object.entries(now.modules)) {
    const before = was.modules[letter] || 0;
    if (stage !== before) out.push({ id, kind: "module", before: `Mod ${letter}${before}`, after: `Mod ${letter}${stage}`, cost: moduleCost(d, letter, before, stage) });
  }
  return out;
}

export function diff(old: { roster: Record<string, RosterOp>; depot: Record<string, number> }, now: { roster: Record<string, RosterOp>; depot: Record<string, number> },
  costs: Record<string, CostData>, c: Const, ops: Map<string, OpIndex>): Progress {
  const changes = Object.values(now.roster).flatMap((r) => operatorChanges(old.roster[r.id], r, costs[r.id], c, !!ops.get(r.id)?.patch));
  const spent: Cost = {};
  changes.forEach((ch) => add(spent, ch.cost));
  const depot: Record<string, number> = {};
  for (const id of new Set([...Object.keys(old.depot), ...Object.keys(now.depot)])) {
    const d = (now.depot[id] || 0) - (old.depot[id] || 0);
    if (d) depot[id] = d;
  }
  return { changes, spent, depot };
}
