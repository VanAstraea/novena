// Base (RIIC) optimizer, after ako's base.py: the best team per room over a shift rotation, from MAA's curated skill
// values (each skill's efficiency per facility and product, plus skill groups like Texas + Lappland that only count
// together). Rooms are filled greedily, production first; with N shifts, shift A gets the best teams from the whole
// roster, shift B the best of who's left, and so on. The Control Center counts its unconditional base-wide buffs
// (the highest of each kind), times the rooms they cover, and its faction effects (Blacksteel in factories, three Kjerag
// in a Trading Post…) counted on the rooms filled before it. Operators the player pins to a room and shift are placed
// there first, and the greedy fill works around them. Not modelled here (ako has them): morale, dorms and cross-shift
// balancing.

export type Facility = "Trade" | "Mfg" | "Power" | "Control" | "Reception" | "Office";
type Eff = Record<string, number | string>;
type Part = [string[], string[], Eff]; // skills needed, allowed char ids (empty = anyone), efficiency

export interface BaseFile {
  formulas?: Record<string, string>; // factory formula id -> the item it makes
  ops: Record<string, [string, number, number][][]>;
  rooms: Record<Facility, { skills: Record<string, Eff>; groups: { desc: string; conditions: Record<string, number>; necessary: Part[]; optional: Part[] }[] }>;
  control: Record<string, Partial<Record<Facility, number>>>;
  factions?: Record<string, FactionRule[]>; // Control Center effects that count a faction (missing in older files)
  names: Record<string, string>;
  morale: Partial<Record<Facility, Record<string, [number, number, number]>>>; // own, room, working (morale per hour)
  dorm: Record<string, [number, number, number, number]>; // everyone, one, own, per dorm level
  train: Record<string, [number, string[], string | null, number | null, number]>; // speed %, classes, branch, level, extra %
  workshop: Record<string, [string, number]>; // materials, byproduct rate %
  layout?: BaseLayout; // missing in files from before the base map
}

/** The base's slot grid from the game's tables, top floor first: each slot's [row, col, height, width, floor];
 *  passages (lifts and corridors) as [row, col, height, width], with a fifth 1 when they're in the annex, which only
 *  shows once a room is built there; and how many operators each kind of room holds per level. */
export interface BaseLayout {
  rows: number; cols: number;
  slots: Record<string, [number, number, number, number, string]>;
  passages: number[][];
  annex: string[];
  capacity: Record<string, number[]>;
}

export interface Room { facility: Facility; product: string; slots: number }
/** A faction effect a Control Center skill has: per member working in a Factory or Trading Post ("per"), per Trading
 *  Post holding `n` of them ("room"), per member anywhere in the base, capped ("base"), or for all such rooms while one
 *  works in the Control Center alongside ("with"). `v`: percent (per product for "per"). */
export type FactionRule =
  | { k: "per"; f: Facility; t: string; v: Record<string, number> }
  | { k: "room"; f: Facility; t: string; n: number; v: number }
  | { k: "base"; f: Facility; t: string; v: number; max: number }
  | { k: "with"; f: Facility; t: string; v: number };
/** What a faction effect adds: `facility` rooms get `value` percent in all (Reception's isn't production). */
export interface FactionGain { faction: string; facility: Facility; value: number }
export interface Team { members: string[]; efficiency: number; group?: string; boosts?: Partial<Record<Facility, number>>; factions?: FactionGain[]; pinned?: string[] }

export const LAYOUTS: Record<string, [number, number, number]> = { "243": [2, 4, 3], "153": [1, 5, 3], "252": [2, 5, 2], "333": [3, 3, 3] };
export const PRODUCT_LABEL: Record<string, string> = { Money: "LMD", PureGold: "Pure Gold", CombatRecord: "Battle Records", all: "Drones", General: "Clues", HR: "Recruitment", Boost: "Base-wide buffs" };
export const ROOM_LABEL: Record<Facility, string> = { Trade: "Trading Post", Mfg: "Factory", Power: "Power Plant", Control: "Control Center", Reception: "Reception Room", Office: "Office" };
const ORDER: Record<Facility, number> = { Trade: 0, Mfg: 1, Power: 2, Control: 3, Reception: 4, Office: 5 };

/** Each Trading Post's and Factory's level (1-3), which is how many operators it holds. Missing: level 3. */
export interface RoomLevels { trade: number[]; mfg: number[] }

export function standardLayout(name: string, goldFactories?: number, levels?: RoomLevels): Room[] {
  const [trade, mfg, power] = LAYOUTS[name];
  const gold = goldFactories ?? trade;
  const lv = (list: number[] | undefined, i: number) => Math.min(3, Math.max(1, list?.[i] || 3));
  return [
    ...Array.from({ length: trade }, (_, i) => ({ facility: "Trade" as Facility, product: "Money", slots: lv(levels?.trade, i) })),
    ...Array.from({ length: mfg }, (_, i) => ({ facility: "Mfg" as Facility, product: i < gold ? "PureGold" : "CombatRecord", slots: lv(levels?.mfg, i) })),
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
  /** `dormLevels`: every dorm's level added up (4 dorms at level 5 = 20), for skills that grow with them; `factions`:
   *  each operator's factions, for the Control Center's faction effects. */
  constructor(public data: BaseFile, public skills: Map<string, Set<string>>, rooms: Room[], dormLevels = 20, public factions: Map<string, string[]> = new Map()) {
    this.env = Object.fromEntries((["Trade", "Mfg", "Power", "Control", "Reception", "Office"] as Facility[]).map((f) => [`NumOf${f}`, rooms.filter((r) => r.facility === f).length]));
    this.env.DormLevels = dormLevels;
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

  /** The best team for a room from who's free. `fixed`: operators pinned here, always in the team (their own value
   *  counted, and in skill combinations when they fit one); the free ones fill the rest. `placed`: the rooms already
   *  filled this shift (the Control Center's faction effects count who's in them). */
  bestTeam(room: Room, free: Set<string>, fixed: string[] = [], placed: [Room, Team][] = []): Team {
    fixed = fixed.slice(0, room.slots);
    const pinned = fixed.length ? { pinned: fixed } : {};
    if (room.facility === "Control") return { ...this.controlTeam(room, free, fixed, placed), ...pinned };
    const fac = this.data.rooms[room.facility];
    if (!fac) return { members: [...fixed], efficiency: 0, ...pinned };
    const own = (c: string) => this.single(room.facility, c, room.product);
    const singles = [...free].filter((c) => !fixed.includes(c)).map((c) => [own(c), c] as [number, string]).filter(([v]) => v > 0)
      .sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
    const top = singles.slice(0, room.slots - fixed.length);
    let best: Team = { members: [...fixed, ...top.map(([, c]) => c)], efficiency: fixed.reduce((s, c) => s + own(c), 0) + top.reduce((s, [v]) => s + v, 0), ...pinned };
    const mine = new Set(fixed);
    for (const g of fac.groups) {
      if (Object.entries(g.conditions).some(([k, v]) => (this.env[k] || 0) < v)) continue;
      const pool = new Set([...free, ...fixed]);
      const members: string[] = [];
      let total = 0;
      let ok = true;
      // a pinned operator takes a part they can hold before anyone free does
      const holder = (part: Part) => this.holder(part, new Set([...pool].filter((c) => mine.has(c)))) ?? this.holder(part, pool);
      for (const part of g.necessary) {
        const h = holder(part);
        if (!h) { ok = false; break; }
        members.push(h);
        pool.delete(h);
        total += value(part[2], room.product, this.env);
      }
      if (!ok || members.length > room.slots) continue;
      const extras: [number, string][] = [];
      for (const part of g.optional) {
        const h = holder(part);
        if (h) extras.push([value(part[2], room.product, this.env), h]);
      }
      extras.push(...fixed.filter((c) => pool.has(c)).map((c) => [own(c), c] as [number, string]), ...singles.filter(([, c]) => pool.has(c)));
      extras.sort((a, b) => b[0] - a[0]);
      // pinned operators go in first (at their best value here), then the best of the rest
      for (const c of fixed) {
        if (!pool.has(c)) continue;
        members.push(c); pool.delete(c);
        total += Math.max(0, ...extras.filter(([, x]) => x === c).map(([v]) => v));
      }
      if (members.length > room.slots) continue;
      for (const [v, c] of extras) {
        if (members.length >= room.slots) break;
        if (pool.has(c)) { members.push(c); pool.delete(c); total += v; }
      }
      if (total > best.efficiency) best = { members, efficiency: total, group: g.desc, ...pinned };
    }
    return best;
  }

  /** A Control Center team's worth: its base-wide buffs (the highest of each kind) over the rooms they cover, plus its
   *  faction effects on the rooms in `placed`. */
  controlValue(members: string[], placed: [Room, Team][] = []): Team {
    const boosts: Partial<Record<Facility, number>> = {};
    const gains: FactionGain[] = [];
    const of = (id: string, t: string) => !!this.factions.get(id)?.includes(t);
    for (const m of members) for (const s of this.skills.get(m) || []) {
      for (const [f, v] of Object.entries(this.data.control[s] || {}) as [Facility, number][]) boosts[f] = Math.max(boosts[f] || 0, v);
      for (const r of this.data.factions?.[s] || []) {
        if (r.k === "with") {
          if (members.some((x) => x !== m && of(x, r.t))) boosts[r.f] = Math.max(boosts[r.f] || 0, r.v);
          continue;
        }
        let value = 0;
        if (r.k === "base") {
          const n = [...members, ...placed.flatMap(([, t]) => t.members)].filter((x) => of(x, r.t)).length;
          value = Math.min(r.max, n * r.v);
        } else {
          for (const [room, team] of placed) {
            if (room.facility !== r.f) continue;
            const n = team.members.filter((x) => of(x, r.t)).length;
            value += r.k === "per" ? n * (r.v[room.product] ?? r.v.all ?? 0) : n >= r.n ? r.v : 0;
          }
        }
        if (value) gains.push({ faction: r.t, facility: r.f, value });
      }
    }
    const production = (boosts.Trade || 0) * this.env.NumOfTrade + (boosts.Mfg || 0) * this.env.NumOfMfg
      + gains.filter((g) => g.facility === "Trade" || g.facility === "Mfg").reduce((t, g) => t + g.value, 0);
    return { members, efficiency: production, boosts, ...(gains.length ? { factions: gains } : {}) };
  }

  controlTeam(room: Room, free: Set<string>, fixed: string[] = [], placed: [Room, Team][] = []): Team {
    const holders = [...free].filter((c) => [...(this.skills.get(c) || [])].some((s) => this.data.control[s] || this.data.factions?.[s])).sort();
    let members: string[] = [...fixed];
    let current = this.controlValue(members, placed);
    while (members.length < room.slots) {
      let best: Team | null = null;
      for (const c of holders) {
        if (members.includes(c)) continue;
        const t = this.controlValue([...members, c], placed);
        if (!best || t.efficiency > best.efficiency) best = t;
        // an effect that needs a partner of a faction alongside: try the holder with one (the first free, by id)
        if (members.length + 2 > room.slots) continue;
        for (const r of [...(this.skills.get(c) || [])].flatMap((sk) => this.data.factions?.[sk] || [])) {
          if (r.k !== "with" || members.some((x) => this.factions.get(x)?.includes(r.t))) continue;
          const partner = [...free].filter((x) => x !== c && !members.includes(x) && this.factions.get(x)?.includes(r.t)).sort()[0];
          if (!partner) continue;
          const pair = this.controlValue([...members, c, partner], placed);
          if (pair.efficiency > best.efficiency) best = pair;
        }
      }
      if (!best || best.efficiency <= current.efficiency) break;
      members = best.members;
      current = best;
    }
    return current;
  }
}

const fillOrder = (rooms: Room[]) => [...rooms].sort((a, b) => ORDER[a.facility] - ORDER[b.facility] || Number(a.product !== "PureGold") - Number(b.product !== "PureGold"));

/** Fills the rooms in order: production first, gold before records. `fixed(j)`: who's pinned to the j-th room of that
 *  order (the order the result comes in). */
export function assign(rooms: Room[], ev: Evaluator, roster: Set<string>, fixed: (j: number) => string[] = () => []): [Room, Team][] {
  const free = new Set(roster);
  const out: [Room, Team][] = [];
  for (const room of fillOrder(rooms)) {
    const team = ev.bestTeam(room, free, fixed(out.length), out);
    team.members.forEach((m) => free.delete(m));
    out.push([room, team]);
  }
  return out;
}

/** Operators the player placed by hand: `at` maps "shift.room" (the room's place in a shift's list, from 0) to who's
 *  pinned there; `out` are kept out of the base altogether. */
export interface Pins { at: Record<string, string[]>; out: string[] }
export const NO_PINS: Pins = { at: {}, out: [] };

/** The pins that apply to this rotation: shifts and rooms it has, operators you own, each operator once, no more than
 *  a room holds. */
export function activePins(pins: Pins, rooms: Room[], shifts: number, roster: Set<string>): Pins {
  const seen = new Set<string>();
  const out = pins.out.filter((c) => roster.has(c));
  out.forEach((c) => seen.add(c));
  const at: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(pins.at)) {
    const [s, j] = key.split(".").map(Number);
    if (!(s >= 0 && s < shifts && rooms[j])) continue;
    const list = ids.filter((c) => roster.has(c) && !seen.has(c)).slice(0, rooms[j].slots);
    list.forEach((c) => seen.add(c));
    if (list.length) at[key] = list;
  }
  return { at, out };
}

/** Shift A gets the best teams from everyone, shift B the best of who's left, and so on; pinned operators are placed
 *  first where they're pinned and kept for that room, and the kept-out ones aren't used. */
export function rotation(rooms: Room[], ev: Evaluator, roster: Set<string>, shifts: number, pins: Pins = NO_PINS): [Room, Team][][] {
  const sorted = fillOrder(rooms); // the order rooms are filled and listed in
  const p = activePins(pins, sorted, shifts, roster);
  const reserved = new Set([...p.out, ...Object.values(p.at).flat()]);
  const free = new Set([...roster].filter((c) => !reserved.has(c)));
  const out: [Room, Team][][] = [];
  for (let i = 0; i < shifts; i++) {
    const a = assign(rooms, ev, free, (j) => p.at[`${i}.${j}`] || []);
    a.forEach(([, t]) => t.members.forEach((m) => free.delete(m)));
    out.push(a);
  }
  return out;
}

/** Production points: Trading Posts', Factories' and Power Plants' percent bonuses plus the Control Center's buffs. */
export const production = (a: [Room, Team][]) => a.filter(([r]) => ["Trade", "Mfg", "Power", "Control"].includes(r.facility)).reduce((s, [, t]) => s + t.efficiency, 0);

/** The room kind Novena Sync names each facility by. */
export const SYNC_ROOM: Record<Facility, string> = { Trade: "TRADING", Mfg: "MANUFACTURE", Power: "POWER", Control: "CONTROL", Reception: "MEETING", Office: "HIRE" };

/** Synced rooms in the game's order: top floor first, then left to right, as the game (and MAA) number rooms of a
 *  kind. Rooms the layout doesn't place go last. */
export function gameOrder<T extends { slot: string }>(rooms: T[], layout?: BaseLayout): T[] {
  if (!layout) return rooms;
  const at = (r: T) => layout.slots[r.slot] || [99, 99];
  return [...rooms].sort((a, b) => at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1]);
}

/** What a factory's product is made of in the game's items: gold, or any of the Battle Records. */
const PRODUCT_ITEMS: Record<string, string[]> = { PureGold: ["3003"], CombatRecord: ["2001", "2002", "2003", "2004"] };

export interface SyncedRoom { slot: string; room: string; level?: number; formula?: string; team?: { charId: string }[] }

/** One shift of the plan laid onto your base. Each facility's planned rooms go to your rooms of that kind: a room
 *  big enough for the team first, then (factories) one already making that product, then the fewest operators moving
 *  in, then the order given (the game's: top floor first, then left to right). `formulas`: factory formula -> item. */
export function shiftBySlot(shift: [Room, Team][], rooms: SyncedRoom[], formulas: Record<string, string> = {}): Map<string, [Room, Team]> {
  const out = new Map<string, [Room, Team]>();
  for (const [f, kind] of Object.entries(SYNC_ROOM) as [Facility, string][]) {
    const mine = rooms.filter((r) => r.room === kind);
    const plan = shift.filter(([r]) => r.facility === f);
    // cost of putting a planned room in one of yours: [doesn't fit, other product, operators moving in]
    const cost = ([room, team]: [Room, Team], r: SyncedRoom): number[] => {
      const here = new Set((r.team || []).map((t) => t.charId));
      const item = r.formula ? formulas[r.formula] : undefined;
      return [
        (f === "Trade" || f === "Mfg") && r.level && room.slots > r.level ? 1 : 0,
        f === "Mfg" && !(item && PRODUCT_ITEMS[room.product]?.includes(item)) ? 1 : 0,
        team.members.filter((m) => !here.has(m)).length,
      ];
    };
    for (const [i, j] of bestMatch(plan.map((e) => mine.map((r) => cost(e, r))))) out.set(mine[j].slot, plan[i]);
  }
  return out;
}

/** The pairing of rows (planned rooms) to columns (your rooms) with the lowest summed cost, costs compared in order
 *  (the first number matters most); ties go to the earliest columns in order. Rooms of a kind are few (five at most),
 *  so every pairing is tried. */
export function bestMatch(costs: number[][][]): [number, number][] {
  const n = costs.length;
  const m = costs[0]?.length ?? 0;
  const k = Math.min(n, m);
  let best: { pairs: [number, number][]; total: number[] } | null = null;
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  const total = (ps: [number, number][]) => ps.reduce((acc, [i, j]) => acc.map((v, x) => v + (costs[i][j][x] || 0)), costs[0]?.[0]?.map(() => 0) ?? []);
  const less = (a: number[], b: number[]) => { for (let x = 0; x < a.length; x++) if (a[x] !== b[x]) return a[x] < b[x]; return false; };
  const walk = (i: number) => {
    if (pairs.length === k || i === n) {
      if (pairs.length < k) return;
      const t = total(pairs);
      if (!best || less(t, best.total)) best = { pairs: [...pairs], total: t };
      return;
    }
    for (let j = 0; j < m; j++) {
      if (used.has(j)) continue;
      used.add(j); pairs.push([i, j]);
      walk(i + 1);
      used.delete(j); pairs.pop();
    }
    if (n - i > k - pairs.length) walk(i + 1); // more planned rooms than yours: this one can go unplaced
  };
  walk(0);
  return (best as { pairs: [number, number][] } | null)?.pairs ?? [];
}

/** How many operators a shift puts into a room they aren't in now. */
export function movesFrom(planned: Map<string, [Room, Team]>, rooms: { slot: string; team: { charId: string }[] }[]): number {
  let n = 0;
  for (const r of rooms) {
    const here = new Set(r.team.map((t) => t.charId));
    n += planned.get(r.slot)?.[1].members.filter((m) => !here.has(m)).length || 0;
  }
  return n;
}
