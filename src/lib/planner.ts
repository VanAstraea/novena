// Growth prioritization (ported from ako's planner.py): which upgrades unlock the most community clears per
// sanity spent. The account is scored by the community clear guides (MAA Copilot) it can follow:
//  - each operator use has hard requirements (stated, plus game rules) and soft ones for what the guide leaves
//    unstated, each lowering the guide's chance by how common the community has it;
//  - a guide's chance is the product of its slots' best options, one slot may be a borrowed support operator;
//  - a stage is worth half "at least one guide works" plus half the share of guides expected to work, averaged
//    per content category with the usage weights;
//  - candidates are per-operator target states from the requirement profiles guides use, at increasing depth
//    (hard only, +E2/level, +mastery, +module), chosen greedily by coverage gained per sanity, lazily re-scored.
import { add, sanity, stateCost, type Const, type Cost, type CostData, type OpState } from "./costs";

export const SUPPORT_SLOTS = 1;
const PROFILES_PER_OPERATOR = 3;
const SOFT_DEPTHS: number[][] = [[], [0, 1], [0, 1, 2], [0, 1, 2, 3]];
const CERTAIN = 1 - 1e-9;
const MIN_GUIDES = 3;

export interface Soft { kind: 0 | 1 | 2 | 3; value: number | string; miss: number }
export interface Req { elite: number; level: number; skill: number; sl: number; module: string; mstage: number; soft: Soft[] }

export interface Guidebook {
  chars: string[];
  stages: [string, string][];
  reqs: [number, number, number, number, string, number, [number, number | string, number][]][];
  guides: [number, number, [number, number][][], number][];
}

export function meetsHard(s: OpState, r: Req): boolean {
  if (s.elite < r.elite || (s.elite === r.elite && s.level < r.level)) return false;
  if (r.sl >= 8) {
    if (s.skillLevel < 7 || r.skill > s.masteries.length || s.masteries[r.skill - 1] < r.sl - 7) return false;
  } else if (s.skillLevel < r.sl) return false;
  return !r.module || (s.modules[r.module] || 0) >= Math.max(1, r.mstage);
}

function meetsSoft(s: OpState, soft: Soft, skill: number): boolean {
  if (soft.kind === 0) return s.elite >= (soft.value as number);
  if (soft.kind === 1) return s.elite > 2 || (s.elite === 2 && s.level >= (soft.value as number));
  if (soft.kind === 2) return skill <= s.masteries.length && s.masteries[skill - 1] >= (soft.value as number);
  return (s.modules[soft.value as string] || 0) >= 1;
}

export function chance(s: OpState, r: Req): number {
  if (!meetsHard(s, r)) return 0;
  let p = 1;
  let eliteFailed = false;
  for (const soft of r.soft) {
    if (soft.kind === 1 && eliteFailed) continue; // not being E2 already covers not being at the E2 level
    if (!meetsSoft(s, soft, r.skill)) {
      p *= soft.miss;
      if (soft.kind === 0) eliteFailed = true;
    }
  }
  return p;
}

export const stateKey = (s: OpState) => `${s.elite}.${s.level}.${s.skillLevel}.${s.masteries.join("")}.${Object.entries(s.modules).sort().map(([k, v]) => k + v).join("")}`;

interface Guide { stage: string; weight: number; slots: [string, Req][][]; borrowable: boolean[]; job: number }

class Totals {
  w = new Map<string, number>();
  c = new Map<string, number>();
  lf = new Map<string, number>();
  inc(m: Map<string, number>, k: string, v: number) { m.set(k, (m.get(k) || 0) + v); }
}

export class Coverage {
  index = new Map<string, [number, number[]][]>();
  slotP: number[][];
  p: number[];
  total = new Map<string, number>();
  t = new Totals();

  constructor(public guides: Guide[], public stageMult: Map<string, number>, public roster: Map<string, OpState>, public support = SUPPORT_SLOTS) {
    guides.forEach((g, gi) => {
      const here = new Map<string, number[]>();
      g.slots.forEach((slot, si) => {
        for (const cid of new Set(slot.map(([c]) => c))) here.set(cid, [...(here.get(cid) || []), si]);
      });
      for (const [cid, slots] of here) {
        let list = this.index.get(cid);
        if (!list) this.index.set(cid, (list = []));
        list.push([gi, slots]);
      }
    });
    const memo = new Map<string, Map<Req, number>>();
    this.slotP = guides.map((g) => g.slots.map((slot) => {
      let best = 0;
      for (const [cid, req] of slot) {
        const st = roster.get(cid);
        if (!st) continue;
        let m = memo.get(cid);
        if (!m) memo.set(cid, (m = new Map()));
        let p = m.get(req);
        if (p === undefined) m.set(req, (p = chance(st, req)));
        if (p > best) best = p;
      }
      return best;
    }));
    this.p = guides.map((_, gi) => this.guideP(gi, this.slotP[gi]));
    guides.forEach((g, gi) => {
      this.total.set(g.stage, (this.total.get(g.stage) || 0) + g.weight);
      this.addTo(this.t, gi, this.p[gi], 1);
    });
  }

  guideP(gi: number, slotP: number[]): number {
    const borrow = this.guides[gi].borrowable;
    let p = 1;
    let weakest = -1;
    slotP.forEach((v, s) => {
      p *= v;
      if (this.support && borrow[s] && (weakest < 0 || v < slotP[weakest])) weakest = s;
    });
    if (weakest < 0) return p;
    if (slotP[weakest] > 0) return p / slotP[weakest];
    p = 1;
    slotP.forEach((v, s) => { if (s !== weakest) p *= v; });
    return p;
  }

  addTo(t: Totals, gi: number, p: number, sign: number) {
    const g = this.guides[gi];
    t.inc(t.w, g.stage, sign * p * g.weight);
    if (p >= CERTAIN) t.inc(t.c, g.stage, sign);
    else if (p > 0) t.inc(t.lf, g.stage, sign * Math.log1p(-p));
  }

  any(c: number, lf: number) { return c > 0 ? 1 : 1 - Math.exp(lf); }

  stageValue(stage: string, w: number, c: number, lf: number) {
    const total = this.total.get(stage) || 0;
    if (!total) return 0;
    return (this.stageMult.get(stage) || 0) * (0.5 * this.any(c, lf) + 0.5 * w / total);
  }

  value() {
    let v = 0;
    for (const s of this.total.keys()) v += this.stageValue(s, this.t.w.get(s) || 0, this.t.c.get(s) || 0, this.t.lf.get(s) || 0);
    return v;
  }

  clearable() {
    let n = 0;
    for (const s of this.total.keys()) n += this.any(this.t.c.get(s) || 0, this.t.lf.get(s) || 0);
    return n;
  }

  /** Guides whose chance moves if the operator were in `state` (at or above its current one). */
  changes(cid: string, state: OpState): Map<number, [number[], number]> {
    const out = new Map<number, [number[], number]>();
    const memo = new Map<Req, number>();
    for (const [gi, slots] of this.index.get(cid) || []) {
      const old = this.slotP[gi];
      const options = this.guides[gi].slots;
      let slotP: number[] | null = null;
      for (const s of slots) {
        let best = 0;
        for (const [c, req] of options[s]) {
          if (c !== cid) continue;
          let p = memo.get(req);
          if (p === undefined) memo.set(req, (p = chance(state, req)));
          if (p > best) best = p;
        }
        if (best > old[s]) {
          slotP ??= [...old];
          slotP[s] = best;
        }
      }
      if (slotP) out.set(gi, [slotP, this.guideP(gi, slotP)]);
    }
    return out;
  }

  delta(cid: string, state: OpState): { gain: number; stages: number; guides: number } {
    const d = new Totals();
    let guides = 0;
    for (const [gi, [, p]] of this.changes(cid, state)) {
      if (p === this.p[gi]) continue;
      this.addTo(d, gi, this.p[gi], -1);
      this.addTo(d, gi, p, 1);
      guides += p - this.p[gi];
    }
    let gain = 0;
    let stages = 0;
    for (const stage of new Set([...d.w.keys(), ...d.c.keys(), ...d.lf.keys()])) {
      const w = this.t.w.get(stage) || 0, c = this.t.c.get(stage) || 0, lf = this.t.lf.get(stage) || 0;
      const nw = w + (d.w.get(stage) || 0), nc = c + (d.c.get(stage) || 0), nlf = lf + (d.lf.get(stage) || 0);
      gain += this.stageValue(stage, nw, nc, nlf) - this.stageValue(stage, w, c, lf);
      stages += this.any(nc, nlf) - this.any(c, lf);
    }
    return { gain, stages, guides };
  }

  apply(cid: string, state: OpState) {
    for (const [gi, [slotP, p]] of this.changes(cid, state)) {
      if (p !== this.p[gi]) {
        this.addTo(this.t, gi, this.p[gi], -1);
        this.addTo(this.t, gi, p, 1);
      }
      this.slotP[gi] = slotP;
      this.p[gi] = p;
    }
    this.roster.set(cid, state);
  }

  /** Stages whose chance of having a working guide rises most with this upgrade. */
  stageGains(cid: string, after: OpState, top = 6): [string, number][] {
    const d = new Totals();
    for (const [gi, [, p]] of this.changes(cid, after)) {
      if (p === this.p[gi]) continue;
      this.addTo(d, gi, this.p[gi], -1);
      this.addTo(d, gi, p, 1);
    }
    const out: [string, number][] = [];
    for (const stage of new Set([...d.c.keys(), ...d.lf.keys()])) {
      const c = this.t.c.get(stage) || 0, lf = this.t.lf.get(stage) || 0;
      const rise = this.any(c + (d.c.get(stage) || 0), lf + (d.lf.get(stage) || 0)) - this.any(c, lf);
      if (rise > 0.005) out.push([stage, rise]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, top);
  }
}

export interface PlanInput {
  book: Guidebook;
  costs: Record<string, CostData>;
  constTable: Const;
  values: Record<string, number>;
  roster: Record<string, { elite: number; level: number; skillLevel: number; masteries: number[]; modules: Record<string, number> }>;
  available: string[]; // char ids on the server (for borrowable support)
  shared: string[]; // alternate forms whose promotion belongs to the base form
  fixed?: string[]; // operators upgraded outside materials (obtained in IS): scored, never suggested
  weights: Record<string, number>;
  top: number;
  support: number;
  goals: Record<string, OpState>;
  stageFilter?: string[];
}

export interface PlanStep {
  id: string;
  before: OpState;
  after: OpState;
  cost: Cost;
  sanity: number;
  gain: number;
  stages: number;
  guides: number;
  stageGains: [string, number][];
}

export interface PlanResult {
  startValue: number;
  startStages: number;
  totalStages: number;
  goalValue: number | null;
  endValue: number;
  goals: PlanStep[];
  steps: PlanStep[];
  guides: number;
}

function stateFor(c: CostData, r: PlanInput["roster"][string]): OpState {
  return {
    elite: r.elite, level: r.level, skillLevel: r.skillLevel,
    masteries: c.skills.map((_, i) => r.masteries[i] || 0),
    modules: Object.fromEntries(c.modules.map((m) => [m.letter, r.modules[m.letter] || 0])),
  };
}

/** The cheapest state at or above `current` meeting `req`'s hard requirements and the chosen soft ones; null if
 * the server can't get there (promotion cap, a module only CN has, a missing skill). */
export function raiseTo(c: CostData, current: OpState, req: Req, kinds: number[]): OpState | null {
  const caps = c.phases.map((p) => p.max);
  let [elite, level] = current.elite > req.elite || (current.elite === req.elite && current.level >= req.level)
    ? [current.elite, current.level] : [req.elite, req.level];
  const raise = (e: number, l: number) => {
    if (e > elite || (e === elite && l > level)) { elite = e; level = l; }
  };
  let skillLevel = Math.max(current.skillLevel, Math.min(req.sl, 7));
  const masteries = [...current.masteries];
  const modules = { ...current.modules };
  const needMastery = (m: number) => {
    if (!req.skill || req.skill > masteries.length) return false;
    masteries[req.skill - 1] = Math.max(masteries[req.skill - 1], m);
    return true;
  };
  const needModule = (letter: string, stage: number) => {
    if (!(letter in modules)) return false;
    modules[letter] = Math.max(modules[letter], stage);
    return true;
  };
  if (req.sl >= 8 && !needMastery(req.sl - 7)) return null;
  if (req.module && !needModule(req.module, Math.max(1, req.mstage))) return null;
  for (const soft of req.soft) {
    if (!kinds.includes(soft.kind)) continue;
    if (soft.kind === 0) raise(2, 1);
    else if (soft.kind === 1) raise(2, soft.value as number);
    else if (soft.kind === 2) { if (!needMastery(soft.value as number)) return null; }
    else if (!needModule(soft.value as string, 1)) return null;
  }
  if (masteries.some((m) => m > 0)) skillLevel = 7;
  const modulesChanged = Object.keys(modules).some((k) => modules[k] !== (current.modules[k] || 0));
  if (masteries.some((m, i) => m > current.masteries[i]) || modulesChanged) raise(2, 1);
  for (const [letter, stage] of Object.entries(modules)) {
    if (stage > (current.modules[letter] || 0)) raise(2, c.modules.find((m) => m.letter === letter)?.unlock.level || 1);
  }
  if (skillLevel > 4) raise(1, 1);
  level = Math.max(level, 1);
  if (elite >= caps.length || level > caps[elite]) return null;
  return { elite, level, skillLevel, masteries, modules };
}

export function makePlan(input: PlanInput, progress?: (phase: string, done: number, total: number) => void): PlanResult {
  const report = progress || (() => undefined);
  const { book, costs, values } = input;
  const available = new Set(input.available);
  const shared = new Set(input.shared);
  const filter = input.stageFilter ? new Set(input.stageFilter) : null;
  report("Reading the community guides", 0, 1);
  const reqs: Req[] = book.reqs.map(([elite, level, skill, sl, module, mstage, soft]) => ({
    elite, level, skill, sl, module, mstage, soft: soft.map(([kind, value, miss]) => ({ kind: kind as Soft["kind"], value, miss })),
  }));
  const guides: Guide[] = [];
  for (const [si, weight, slots, job] of book.guides) {
    const stage = book.stages[si][0];
    if (filter && !filter.has(stage)) continue;
    const s = slots.map((slot) => slot.map(([ci, ri]) => [book.chars[ci], reqs[ri]] as [string, Req]));
    guides.push({ stage, weight, slots: s, borrowable: s.map((slot) => slot.some(([c]) => available.has(c))), job });
  }
  const category = new Map(book.stages.map(([id, cat]) => [id, cat]));
  // per-stage factor so the account value is the category-weighted mean of stage values (0-1)
  const counts = new Map<string, number>();
  for (const g of guides) counts.set(g.stage, (counts.get(g.stage) || 0) + 1);
  const mass = new Map<string, number>();
  const damp = new Map<string, number>();
  for (const [s, n] of counts) {
    const d = Math.min(1, n / MIN_GUIDES);
    damp.set(s, d);
    const cat = category.get(s) || "other";
    mass.set(cat, (mass.get(cat) || 0) + d);
  }
  const totalW = Object.entries(input.weights).filter(([c]) => mass.get(c)).reduce((a, [, w]) => a + w, 0) || 1;
  const mult = new Map<string, number>();
  for (const [s, d] of damp) {
    const cat = category.get(s) || "other";
    mult.set(s, ((input.weights[cat] || 0) * d) / (mass.get(cat) || 1) / totalW);
  }

  report("Scoring your roster against the guides", 0, 1);
  const ops = Object.keys(input.roster).filter((cid) => costs[cid]);
  const roster = new Map(ops.map((cid) => [cid, stateFor(costs[cid], input.roster[cid])]));
  const cov = new Coverage(guides, mult, roster, input.support);
  const profileCounts = new Map<string, Map<Req, number>>();
  for (const g of guides) for (const slot of g.slots) for (const [cid, req] of slot) {
    if (!roster.has(cid)) continue;
    let m = profileCounts.get(cid);
    if (!m) profileCounts.set(cid, (m = new Map()));
    m.set(req, (m.get(req) || 0) + 1);
  }
  const profiles = new Map([...profileCounts].map(([cid, m]) => [cid, [...m].sort((a, b) => b[1] - a[1]).map(([r]) => r)]));
  const startValue = cov.value();
  const startStages = cov.clearable();

  const priced = (cid: string, before: OpState, after: OpState): PlanStep => {
    const cost = stateCost(costs[cid], input.constTable, before, after, shared.has(cid));
    return { id: cid, before, after, cost, sanity: sanity(cost, values), gain: 0, stages: 0, guides: 0, stageGains: [] };
  };

  const goalSteps: PlanStep[] = [];
  for (const [cid, after] of Object.entries(input.goals)) {
    const current = cov.roster.get(cid);
    if (!current || stateKey(after) === stateKey(current)) continue;
    const step = priced(cid, current, after);
    Object.assign(step, cov.delta(cid, after));
    cov.apply(cid, after);
    goalSteps.push(step);
  }
  const goalValue = goalSteps.length ? cov.value() : null;

  const fixed = new Set(input.fixed || []);
  const candidates = (cid: string): PlanStep[] => {
    if (fixed.has(cid)) return [];
    const current = cov.roster.get(cid)!;
    const seen = new Set<string>();
    const out: PlanStep[] = [];
    let used = 0;
    for (const req of profiles.get(cid) || []) {
      if (used >= PROFILES_PER_OPERATOR) break;
      if (chance(current, req) >= CERTAIN) continue;
      used++;
      for (const depth of SOFT_DEPTHS) {
        const after = raiseTo(costs[cid], current, req, depth);
        if (!after) continue;
        const k = stateKey(after);
        if (k === stateKey(current) || seen.has(k)) continue;
        if (shared.has(cid) && (after.elite !== current.elite || after.level !== current.level || after.skillLevel !== current.skillLevel)) continue;
        seen.add(k);
        out.push(priced(cid, current, after));
      }
    }
    return out;
  };

  // lazy greedy: a max-heap of gain per sanity, entries re-scored when the plan has moved on since they were scored
  type Entry = { score: number; version: number; step: PlanStep };
  const heap: Entry[] = [];
  const push = (e: Entry) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].score >= heap[i].score) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): Entry | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].score > heap[m].score) m = l;
        if (r < heap.length && heap[r].score > heap[m].score) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  let version = 0;
  const score = (step: PlanStep) => {
    Object.assign(step, cov.delta(step.id, step.after));
    if (step.gain > 1e-12) push({ score: step.gain / Math.max(step.sanity, 1), version, step });
  };
  ops.forEach((cid, n) => {
    if (n % 20 === 0) report("Pricing every upgrade", n, ops.length);
    for (const step of candidates(cid)) score(step);
  });
  const picked: PlanStep[] = [];
  while (heap.length && picked.length < input.top) {
    report("Choosing the steps", picked.length, input.top);
    const e = pop()!;
    if (stateKey(cov.roster.get(e.step.id)!) !== stateKey(e.step.before)) continue;
    if (e.version !== version) { score(e.step); continue; }
    e.step.stageGains = cov.stageGains(e.step.id, e.step.after);
    cov.apply(e.step.id, e.step.after);
    picked.push(e.step);
    version++;
    for (const nxt of candidates(e.step.id)) score(nxt);
  }
  return { startValue, startStages, totalStages: cov.total.size, goalValue, endValue: cov.value(), goals: goalSteps, steps: picked, guides: guides.length };
}

export const totalOf = (steps: { cost: Cost }[]) => steps.reduce<Cost>((acc, s) => add(acc, s.cost), {});
