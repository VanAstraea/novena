// Operator stats at a chosen build. Structured so a DPS simulator can take `BuildStats` later: base attributes
// first, then each bonus layer kept separate (trust, potential, module) so a sim can apply skill buffs on top.
import type { OpDetail, StatKey, Stats } from "../types";

export interface BuildSpec {
  elite: number;
  level: number;
  pot: number; // 1-6
  trust: number; // 0-200 (%); bonuses stop growing at 100
  module?: { letter: string; stage: number } | null;
  skill?: number; // index
  skillLevel?: number; // 1-10 (8-10 = M1-M3)
}

export interface BuildStats {
  base: Stats;
  trust: Stats;
  pot: Stats;
  module: Stats;
  total: Required<Pick<Stats, "hp" | "atk" | "def" | "res" | "cost" | "block" | "interval" | "respawn" | "aspd">>;
  /** Seconds between attacks after attack speed. */
  attackTime: number;
  /** ATK × attacks per second, before enemy DEF/RES and skills: a rough comparison number, not a DPS figure. */
  atkPerSec: number;
}

const ROUNDED: StatKey[] = ["hp", "atk", "def"];

export function clampSpec(d: OpDetail, s: BuildSpec): BuildSpec {
  const elite = Math.min(Math.max(s.elite, 0), d.phases.length - 1);
  const level = Math.min(Math.max(s.level, 1), d.phases[elite].max);
  const module = s.module && elite >= 2 && d.modules.some((m) => m.letter === s.module!.letter) ? s.module : null;
  return { ...s, elite, level, pot: Math.min(Math.max(s.pot, 1), 6), trust: Math.min(Math.max(s.trust, 0), 200), module };
}

export function statsAt(d: OpDetail, spec: BuildSpec): BuildStats {
  const s = clampSpec(d, spec);
  const p = d.phases[s.elite];
  const t = p.max > 1 ? (s.level - 1) / (p.max - 1) : 0;
  const base: Stats = {};
  for (const k of Object.keys(p.hi) as StatKey[]) {
    const lo = p.lo[k] ?? 0;
    const hi = p.hi[k] ?? 0;
    const v = lo + (hi - lo) * t;
    base[k] = ROUNDED.includes(k) ? Math.round(v) : k === "res" ? Math.round(v * 10) / 10 : v;
  }
  const trustShare = Math.min(s.trust, 100) / 100;
  const trust: Stats = {};
  for (const [k, v] of Object.entries(d.trust) as [StatKey, number][]) trust[k] = Math.round(v * trustShare);
  const pot: Stats = {};
  d.pots.slice(0, s.pot - 1).forEach((r) => {
    for (const [k, v] of Object.entries(r.mods) as [StatKey, number][]) pot[k] = (pot[k] || 0) + v;
  });
  const module: Stats = {};
  if (s.module && s.module.stage > 0) {
    const m = d.modules.find((x) => x.letter === s.module!.letter);
    const stage = m?.stages[s.module.stage - 1];
    for (const [k, v] of Object.entries(stage?.attrs || {}) as [StatKey, number][]) module[k] = v;
  }
  const get = (k: StatKey) => (base[k] || 0) + (trust[k] || 0) + (pot[k] || 0) + (module[k] || 0);
  const total = {
    hp: get("hp"), atk: get("atk"), def: get("def"), res: get("res"), cost: get("cost"), block: get("block"),
    interval: base.interval || 0, respawn: get("respawn"), aspd: get("aspd") || 100,
  };
  const attackTime = total.interval * 100 / total.aspd;
  return { base, trust, pot, module, total, attackTime, atkPerSec: attackTime ? total.atk / attackTime : 0 };
}

/** The range an operator has at an elite (skills may override it). */
export const rangeAt = (d: OpDetail, elite: number) => d.phases[Math.min(elite, d.phases.length - 1)].range;
