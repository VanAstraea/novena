// Target builds as text ("Saria E2 L90, S2 M3, Mod X2"), ported from ako's goals.py, plus the game's prerequisite
// rules that turn a target into a reachable state.
import type { CostData, OpState } from "./costs";

export interface Target {
  elite: number;
  level: number;
  skillLevel: number;
  masteries: Record<number, number>; // skill 1-3 -> mastery 1-3
  modules: Record<string, number>; // letter -> stage 1-3
}

const TOKENS = /\b(?:E(?<elite>[0-2])|L(?:v|vl)?\s?(?<level>\d{1,2})|SL\s?(?<sl>[1-7])|S(?<skill>[1-3])\s?M(?<m>[1-3])|Mod(?:ule)?\s?(?<mod>[XYAD])\s?(?<stage>[1-3])?)\b/gi;

export const emptyTarget = (): Target => ({ elite: 0, level: 0, skillLevel: 0, masteries: {}, modules: {} });

/** "Saria E2 L60 SL7 S2M3 Mod X2" -> the name before the first part, and the target. Throws with a readable
 * message when there's no target or a mastery doesn't say which skill. */
export function parse(text: string): { name: string; target: Target } {
  const t = emptyTarget();
  let first: number | null = null;
  for (const m of text.matchAll(TOKENS)) {
    first ??= m.index ?? 0;
    const g = m.groups!;
    if (g.elite) t.elite = Math.max(t.elite, +g.elite);
    else if (g.level) t.level = Math.max(t.level, +g.level);
    else if (g.sl) t.skillLevel = Math.max(t.skillLevel, +g.sl);
    else if (g.skill) t.masteries[+g.skill] = Math.max(t.masteries[+g.skill] || 0, +g.m);
    else if (g.mod) {
      const k = g.mod.toUpperCase();
      t.modules[k] = Math.max(t.modules[k] || 0, +(g.stage || 1));
    }
  }
  if (first === null) {
    if (/\bM[1-3]\b/i.test(text)) throw new Error("Which skill's mastery? Write S1M3, S2M3 or S3M3");
    throw new Error(`No target in "${text.trim()}": write it like "Saria E2 SL7 S2M3 Mod X2"`);
  }
  if (t.level && !t.elite) throw new Error("Give the promotion with the level, like \"E2 L60\"");
  return { name: text.slice(0, first).replace(/^[\s,:-]+|[\s,:-]+$/g, ""), target: t };
}

export function label(t: Target): string {
  const parts: string[] = [];
  if (t.elite || t.level) parts.push(`E${t.elite}` + (t.level ? ` L${t.level}` : ""));
  if (t.skillLevel) parts.push(`SL${t.skillLevel}`);
  for (const [k, v] of Object.entries(t.masteries).sort()) if (v) parts.push(`S${k} M${v}`);
  for (const [k, v] of Object.entries(t.modules).sort()) if (v) parts.push(`Mod ${k}${v}`);
  return parts.join(", ");
}

export function stateLabel(s: OpState): string {
  return label({
    elite: s.elite, level: s.level, skillLevel: s.skillLevel,
    masteries: Object.fromEntries(s.masteries.map((m, i) => [i + 1, m]).filter(([, m]) => m)),
    modules: Object.fromEntries(Object.entries(s.modules).filter(([, v]) => v)),
  });
}

/** Skill slots unlock with promotion: S2 at E1, S3 at E2. */
export const skillUnlock = (index: number) => index;
/** Skill levels 5-7 need E1. */
export const maxSkillLevel = (elite: number) => (elite >= 1 ? 7 : 4);

/** The state once `target` is reached from `from`, with the game's prerequisites pulled in (a mastery needs E2
 * and SL7, a module E2 and its unlock level), never below `from`. Throws when the operator can't get there. */
export function reach(d: CostData, rarity: number, name: string, from: OpState, t: Target): OpState {
  const maxElite = d.phases.length - 1;
  const s: OpState = { ...from, masteries: [...from.masteries], modules: { ...from.modules } };
  const need = (cond: boolean, what: string) => {
    if (!cond) throw new Error(`${name} can't reach ${what}${rarity <= 3 && what.includes("E2") ? ` (${rarity}★ operators stop at E${maxElite})` : ""}`);
  };
  const raiseElite = (e: number, level = 1) => {
    need(e <= maxElite, `E${e}`);
    if (e > s.elite || (e === s.elite && level > s.level)) {
      if (e > s.elite) s.level = 1;
      s.elite = e;
      s.level = Math.max(s.level, level);
    }
  };
  if (t.elite || t.level) {
    raiseElite(t.elite, t.level || 1);
    need(t.level <= d.phases[t.elite].max, `E${t.elite} L${t.level} (the cap is ${d.phases[t.elite].max})`);
  }
  if (t.skillLevel) {
    need(d.skillUp.length > 0, `SL${t.skillLevel}`);
    if (t.skillLevel > 4) raiseElite(1);
    s.skillLevel = Math.max(s.skillLevel, t.skillLevel);
  }
  for (const [k, m] of Object.entries(t.masteries)) {
    const i = +k - 1;
    need(i < d.skills.length && (d.skills[i].mastery.length >= m), `S${k} M${m}`);
    raiseElite(2);
    s.skillLevel = 7;
    s.masteries[i] = Math.max(s.masteries[i] || 0, m);
  }
  for (const [letter, stage] of Object.entries(t.modules)) {
    const mod = d.modules.find((x) => x.letter === letter);
    need(!!mod, `Mod ${letter}${stage} on this server`);
    raiseElite(mod!.unlock.elite, mod!.unlock.level);
    s.modules[letter] = Math.max(s.modules[letter] || 0, stage);
  }
  return s;
}

export const reached = (from: OpState, to: OpState): boolean =>
  from.elite > to.elite || (from.elite === to.elite && from.level >= to.level)
    ? from.skillLevel >= to.skillLevel && to.masteries.every((m, i) => (from.masteries[i] || 0) >= m)
      && Object.entries(to.modules).every(([k, v]) => (from.modules[k] || 0) >= v)
    : false;
