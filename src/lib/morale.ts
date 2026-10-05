// Morale and dorms (ported from ako's base.py, with the game's default numbers instead of a sync's live ones).
// Every operator has 24 morale and spends it at the room's base rate while working (0.9 an hour in Trading Posts and
// Factories, 1 elsewhere, as measured in game), changed by their own skills ("morale consumption -0.25"), skills that
// change everyone's in the room, and a Control Center skill that helps everyone working elsewhere. A room's team lasts
// until its first member runs out. Off shift, operators recover only in a dorm: about 1.5 + 0.1 x dorm level +
// ambience / 2,500 an hour (4 at level 5 with 5,000 ambience), plus the dorm's best "everyone here recovers faster"
// skill and its best "one operator recovers faster" skill. Conditional and faction-counting effects aren't modelled.
import type { BaseFile, Facility, Room, Team } from "./base";

export const MAX_MORALE = 24;
export interface DormSettings { dorms: number; beds: number; level: number; ambience: number }
export const DEFAULT_DORMS: DormSettings = { dorms: 4, beds: 5, level: 5, ambience: 5000 };

const baseDrain = (f: Facility) => (f === "Trade" || f === "Mfg" ? 0.9 : 1);
export const dormRate = (d: DormSettings) => 1.5 + 0.1 * d.level + d.ambience / 2500;

type Skills = Map<string, Set<string>>;

function effects(data: BaseFile, skills: Skills, f: Facility, id: string): [number, number, number] {
  const table = data.morale[f] || {};
  const out: [number, number, number] = [0, 0, 0];
  for (const s of skills.get(id) || []) {
    const m = table[s];
    if (m) { out[0] += m[0]; out[1] += m[1]; out[2] = Math.max(out[2], m[2]); }
  }
  return out;
}

/** Per room: each member's morale spent per hour there (negative: recovering). */
export function drains(data: BaseFile, skills: Skills, shift: [Room, Team][]): Record<string, number>[] {
  const relief = Math.max(0, ...shift.filter(([r]) => r.facility === "Control").flatMap(([, t]) => t.members.map((c) => effects(data, skills, "Control", c)[2])));
  return shift.map(([room, team]) => {
    const fx = team.members.map((c) => [c, effects(data, skills, room.facility, c)] as const);
    const shared = fx.reduce((s, [, m]) => s + m[1], 0);
    const working = room.facility === "Control" ? 0 : relief;
    return Object.fromEntries(fx.map(([c, m]) => [c, baseDrain(room.facility) + m[0] + shared - working]));
  });
}

/** Hours until a room's first member runs out, from full morale (Infinity: never). */
export const lasts = (d: Record<string, number>) => Math.min(Infinity, ...Object.values(d).filter((x) => x > 0).map((x) => MAX_MORALE / x));

export interface Resting { id: string; used: number; full: number } // morale spent last shift; hours to get it back
export interface Dorm { helpers: { id: string; kind: "everyone" | "one"; value: number }[]; resting: Resting[]; rate: number }
export interface DormPlan { dorms: Dorm[]; noBed: Resting[]; offHours: number }

function dormSkill(data: BaseFile, skills: Skills, id: string, kind: "everyone" | "one", level: number): number {
  let best = 0;
  for (const s of skills.get(id) || []) {
    const d = data.dorm[s];
    if (!d) continue;
    best = Math.max(best, kind === "everyone" ? (d[0] ? d[0] + d[3] * level : 0) : d[1]);
  }
  return best;
}

/** While shift `k` works, who rests where: the other shifts' operators, most tired first, with each dorm's best
 *  "everyone" and "one operator" helpers (taken from anyone not working, preferring those who need the rest anyway). */
export function dormPlan(data: BaseFile, skills: Skills, shifts: [Room, Team][][], k: number, roster: string[], d: DormSettings): DormPlan {
  const hours = MAX_MORALE / shifts.length;
  const working = new Set(shifts[k].flatMap(([, t]) => t.members));
  const used = new Map<string, number>();
  shifts.forEach((shift, i) => {
    if (i === k) return;
    drains(data, skills, shift).forEach((room) => Object.entries(room).forEach(([c, x]) => used.set(c, Math.min(MAX_MORALE, Math.max(0, x * hours)))));
  });
  let queue = [...used.entries()].filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const taken = new Set<string>();
  const base = dormRate(d);
  const offHours = MAX_MORALE - hours;
  const dorms: Dorm[] = [];
  for (let i = 0; i < d.dorms && queue.length; i++) {
    const helpers: Dorm["helpers"] = [];
    for (const kind of ["everyone", "one"] as const) {
      if (helpers.length + 1 >= d.beds) break;
      let best: { id: string; value: number; needs: boolean } | null = null;
      for (const c of roster) {
        if (working.has(c) || taken.has(c)) continue;
        const value = dormSkill(data, skills, c, kind, d.level);
        const needs = queue.includes(c);
        if (value > 0 && (!best || value > best.value || (value === best.value && needs && !best.needs) || (value === best.value && needs === best.needs && c < best.id))) best = { id: c, value, needs };
      }
      if (best) { helpers.push({ id: best.id, kind, value: best.value }); taken.add(best.id); }
    }
    queue = queue.filter((c) => !taken.has(c));
    const rest = queue.slice(0, d.beds - helpers.length);
    queue = queue.slice(rest.length);
    rest.forEach((c) => taken.add(c));
    const everyone = helpers.filter((h) => h.kind === "everyone").reduce((s, h) => s + h.value, 0);
    const one = helpers.find((h) => h.kind === "one")?.value || 0;
    const rate = base + everyone;
    dorms.push({ helpers, rate, resting: rest.map((c, j) => ({ id: c, used: used.get(c)!, full: used.get(c)! / (rate + (j === 0 ? one : 0)) })) });
  }
  return { dorms, offHours, noBed: queue.map((c) => ({ id: c, used: used.get(c)!, full: Infinity })) };
}
