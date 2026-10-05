// Base (RIIC) optimizer, after ako's base.py: the best team per room over a shift rotation, from MAA's curated skill
// values (each skill's efficiency per facility and product, plus skill groups like Texas + Lappland that only count
// together). Rooms are filled greedily, production first; with N shifts, shift A gets the best teams from the whole
// roster, shift B the best of who's left, and so on. The Control Center counts its unconditional base-wide buffs
// (the highest of each kind), times the rooms they cover. Not modelled here (ako has them): morale, faction buffs,
// dorms and cross-shift balancing.

export type Facility = "Trade" | "Mfg" | "Power" | "Control" | "Reception" | "Office";
type Eff = Record<string, number | string>;
type Part = [string[], string[], Eff]; // skills needed, allowed char ids (empty = anyone), efficiency

export interface BaseFile {
  formulas?: Record<string, string>; // factory formula id -> the item it makes
  ops: Record<string, [string, number, number][][]>;
  rooms: Record<Facility, { skills: Record<string, Eff>; groups: { desc: string; conditions: Record<string, number>; necessary: Part[]; optional: Part[] }[] }>;
  control: Record<string, Partial<Record<Facility, number>>>;
  names: Record<string, string>;
  morale: Partial<Record<Facility, Record<string, [number, number, number]>>>; // own, room, working (morale per hour)
  dorm: Record<string, [number, number, number, number]>; // everyone, one, own, per dorm level
  train: Record<string, [number, string[], string | null, number | null, number]>; // speed %, classes, branch, level, extra %
  workshop: Record<string, [string, number]>; // materials, byproduct rate %
}

export interface Room { facility: Facility; product: string; slots: number }
export interface Team { members: string[]; efficiency: number; group?: string; boosts?: Partial<Record<Facility, number>> }

export const LAYOUTS: Record<string, [number, number, number]> = { "243": [2, 4, 3], "153": [1, 5, 3], "252": [2, 5, 2], "333": [3, 3, 3] };
export const PRODUCT_LABEL: Record<string, string> = { Money: "LMD", PureGold: "Pure Gold", CombatRecord: "Battle Records", all: "Drones", General: "Clues", HR: "Recruitment", Boost: "Base-wide buffs" };
export const ROOM_LABEL: Record<Facility, string> = { Trade: "Trading Post", Mfg: "Factory", Power: "Power Plant", Control: "Control Center", Reception: "Reception Room", Office: "Office" };
const ORDER: Record<Facility, number> = { Trade: 0, Mfg: 1, Power: 2, Control: 3, Reception: 4, Office: 5 };

export function standardLayout(name: string, goldFactories?: number): Room[] {
  const [trade, mfg, power] = LAYOUTS[name];
  const gold = goldFactories ?? trade;
  return [
    ...Array.from({ length: trade }, () => ({ facility: "Trade" as Facility, product: "Money", slots: 3 })),
    ...Array.from({ length: mfg }, (_, i) => ({ facility: "Mfg" as Facility, product: i < gold ? "PureGold" : "CombatRecord", slots: 3 })),
    ...Array.from({ length: power }, () => ({ facility: "Power" as Facility, product: "all", slots: 1 })),
    { facility: "Control", product: "Boost", slots: 5 }, { facility: "Reception", product: "General", slots: 2 }, { facility: "Office", product: "HR", slots: 1 },
  ];
}

/** MAA skill ids an operator has at a promotion and level: the latest unlocked skill per slot. */
export function skillsAt(data: BaseFile, id: string, elite: number, level: number): Set<string> {
  const out = new Set<string>();
  for (const slot of data.ops[id] || []) {
    let active: string | null = null;
    for (const [sid, e, l] of slot) if (elite > e || (elite === e && level >= l)) active = sid;
    if (active) out.add(active);
  }
  return out;
}

function value(eff: Eff, product: string, env: Record<string, number>): number {
  for (const key of [product, `${product}_reg`, "all"]) {
    if (!(key in eff)) continue;
    const v = eff[key];
    if (typeof v === "number") return v;
    const expr = String(v).replace(/\[(\w+)\]/g, (_, k) => String(env[k] || 0));
    if (/^[\d\s.+*/()-]+$/.test(expr)) {
      try { return Number(Function(`"use strict";return (${expr})`)()) || 0; } catch { return 0; }
    }
    return 0;
  }
  return 0;
}

export class Evaluator {
  env: Record<string, number>;
  constructor(public data: BaseFile, public skills: Map<string, Set<string>>, rooms: Room[]) {
    this.env = Object.fromEntries((["Trade", "Mfg", "Power", "Control", "Reception", "Office"] as Facility[]).map((f) => [`NumOf${f}`, rooms.filter((r) => r.facility === f).length]));
  }

  single(f: Facility, id: string, product: string): number {
    const table = this.data.rooms[f]?.skills || {};
    let v = 0;
    for (const s of this.skills.get(id) || []) if (table[s]) v += value(table[s], product, this.env);
    return v;
  }

  private holder(part: Part, pool: Set<string>): string | null {
    const [need, allowed] = part;
    const best = [...pool].filter((c) => need.every((s) => this.skills.get(c)?.has(s)) && (!allowed.length || allowed.includes(c))).sort();
    return best[0] ?? null;
  }

  bestTeam(room: Room, free: Set<string>): Team {
    if (room.facility === "Control") return this.controlTeam(room, free);
    const fac = this.data.rooms[room.facility];
    if (!fac) return { members: [], efficiency: 0 };
    const singles = [...free].map((c) => [this.single(room.facility, c, room.product), c] as [number, string]).filter(([v]) => v > 0)
      .sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
    const top = singles.slice(0, room.slots);
    let best: Team = { members: top.map(([, c]) => c), efficiency: top.reduce((s, [v]) => s + v, 0) };
    for (const g of fac.groups) {
      if (Object.entries(g.conditions).some(([k, v]) => (this.env[k] || 0) < v)) continue;
      const pool = new Set(free);
      const members: string[] = [];
      let total = 0;
      let ok = true;
      for (const part of g.necessary) {
        const h = this.holder(part, pool);
        if (!h) { ok = false; break; }
        members.push(h);
        pool.delete(h);
        total += value(part[2], room.product, this.env);
      }
      if (!ok || members.length > room.slots) continue;
      const extras: [number, string][] = [];
      for (const part of g.optional) {
        const h = this.holder(part, pool);
        if (h) extras.push([value(part[2], room.product, this.env), h]);
      }
      extras.push(...singles.filter(([, c]) => pool.has(c)));
      extras.sort((a, b) => b[0] - a[0]);
      for (const [v, c] of extras) {
        if (members.length >= room.slots) break;
        if (pool.has(c)) { members.push(c); pool.delete(c); total += v; }
      }
      if (total > best.efficiency) best = { members, efficiency: total, group: g.desc };
    }
    return best;
  }

  controlValue(members: string[]): Team {
    const boosts: Partial<Record<Facility, number>> = {};
    for (const m of members) for (const s of this.skills.get(m) || []) {
      for (const [f, v] of Object.entries(this.data.control[s] || {}) as [Facility, number][]) boosts[f] = Math.max(boosts[f] || 0, v);
    }
    const production = (boosts.Trade || 0) * this.env.NumOfTrade + (boosts.Mfg || 0) * this.env.NumOfMfg;
    return { members, efficiency: production, boosts };
  }

  controlTeam(room: Room, free: Set<string>): Team {
    const holders = [...free].filter((c) => [...(this.skills.get(c) || [])].some((s) => this.data.control[s])).sort();
    let members: string[] = [];
    let current = this.controlValue(members);
    while (members.length < room.slots) {
      let best: Team | null = null;
      for (const c of holders) {
        if (members.includes(c)) continue;
        const t = this.controlValue([...members, c]);
        if (!best || t.efficiency > best.efficiency) best = t;
      }
      if (!best || best.efficiency <= current.efficiency) break;
      members = best.members;
      current = best;
    }
    return current;
  }
}

export function assign(rooms: Room[], ev: Evaluator, roster: Set<string>): [Room, Team][] {
  const free = new Set(roster);
  const out: [Room, Team][] = [];
  for (const room of [...rooms].sort((a, b) => ORDER[a.facility] - ORDER[b.facility] || Number(a.product !== "PureGold") - Number(b.product !== "PureGold"))) {
    const team = ev.bestTeam(room, free);
    team.members.forEach((m) => free.delete(m));
    out.push([room, team]);
  }
  return out;
}

export function rotation(rooms: Room[], ev: Evaluator, roster: Set<string>, shifts: number): [Room, Team][][] {
  const free = new Set(roster);
  const out: [Room, Team][][] = [];
  for (let i = 0; i < shifts; i++) {
    const a = assign(rooms, ev, free);
    a.forEach(([, t]) => t.members.forEach((m) => free.delete(m)));
    out.push(a);
  }
  return out;
}

/** Production points: Trading Posts', Factories' and Power Plants' percent bonuses plus the Control Center's buffs. */
export const production = (a: [Room, Team][]) => a.filter(([r]) => ["Trade", "Mfg", "Power", "Control"].includes(r.facility)).reduce((s, [, t]) => s + t.efficiency, 0);
