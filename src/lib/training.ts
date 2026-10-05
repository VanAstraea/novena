// Training Room and Workshop (ported from ako's training.py): the best trainer you own for each mastery, and who
// raises the Workshop's byproduct rate. The skills are read from the game's English descriptions by the pipeline
// (base.json "train" and "workshop"). A trainer speeds "<class> Operators' Specialization training", sometimes with an
// extra for one branch or one mastery level; a mastery takes 8, 16 or 24 hours, divided by 1 + the trainer's speed.
// Left out (they need who else is in your base at the moment): skills that count a faction stationed in the base.
import { skillsAt, type BaseFile } from "./base";
import type { RosterOp } from "../state";
import type { OpIndex } from "../types";

export const CLASSES: [string, string][] = [["PIONEER", "Vanguard"], ["WARRIOR", "Guard"], ["TANK", "Defender"], ["SNIPER", "Sniper"],
  ["CASTER", "Caster"], ["MEDIC", "Medic"], ["SUPPORT", "Supporter"], ["SPECIAL", "Specialist"]];

/** A trainer's speed (percent) for a trainee of this class and branch, training to this mastery level. */
export function trainerSpeed(data: BaseFile, skills: Set<string>, cls: string, branch: string, level: number): number {
  let total = 0;
  for (const s of skills) {
    const t = data.train[s];
    if (!t) continue;
    const [speed, classes, onBranch, onLevel, extra] = t;
    if (classes.length && !classes.includes(cls)) continue;
    total += speed + ((onBranch && onBranch === branch) || (onLevel && onLevel === level) ? extra : 0);
  }
  return total;
}

export interface TrainerPick { id: string; speed: number; hours: number; base: number }

/** The owned operators who'd train this mastery fastest (not the trainee), with how long it would take. */
export function bestTrainers(data: BaseFile, roster: Record<string, RosterOp>, trainee: OpIndex, level: number, baseHours: number, top = 3): TrainerPick[] {
  const out: TrainerPick[] = [];
  for (const r of Object.values(roster)) {
    if (r.id === trainee.id) continue;
    const speed = trainerSpeed(data, skillsAt(data, r.id, r.elite, r.level), trainee.cls, trainee.branch, level);
    if (speed > 0) out.push({ id: r.id, speed, hours: baseHours / (1 + speed / 100), base: baseHours });
  }
  return out.sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id)).slice(0, top);
}

/** Class -> your best trainer for M1, M2 and M3 of an operator of that class (branch extras show per operator). */
export function trainersByClass(data: BaseFile, roster: Record<string, RosterOp>): Record<string, ({ id: string; speed: number } | null)[]> {
  const held = Object.values(roster).map((r) => ({ id: r.id, skills: skillsAt(data, r.id, r.elite, r.level) }))
    .filter((h) => [...h.skills].some((s) => data.train[s]));
  const out: Record<string, ({ id: string; speed: number } | null)[]> = {};
  for (const [cls] of CLASSES) {
    out[cls] = [1, 2, 3].map((level) => {
      let best: { id: string; speed: number } | null = null;
      for (const h of held) {
        const speed = trainerSpeed(data, h.skills, cls, "", level);
        if (speed > 0 && (!best || speed > best.speed || (speed === best.speed && h.id < best.id))) best = { id: h.id, speed };
      }
      return best;
    });
  }
  return out;
}

/** Materials -> the owned operators with the highest Workshop byproduct rate for them, best first. */
export function workshopPicks(data: BaseFile, roster: Record<string, RosterOp>, top = 2): [string, { id: string; pct: number }[]][] {
  const found = new Map<string, { id: string; pct: number }[]>();
  for (const r of Object.values(roster)) {
    const best = new Map<string, number>();
    for (const s of skillsAt(data, r.id, r.elite, r.level)) {
      const w = data.workshop[s];
      if (w) best.set(w[0], Math.max(best.get(w[0]) || 0, w[1]));
    }
    for (const [scope, pct] of best) found.set(scope, [...(found.get(scope) || []), { id: r.id, pct }]);
  }
  const rank = (s: string) => [s !== "Any material", !s.startsWith("Elite"), s] as const;
  return [...found.entries()]
    .sort(([a], [b]) => { const x = rank(a), y = rank(b); return Number(x[0]) - Number(y[0]) || Number(x[1]) - Number(y[1]) || a.localeCompare(b); })
    .map(([scope, list]) => [scope, list.sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id)).slice(0, top)]);
}

export function hm(hours: number): string {
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}
