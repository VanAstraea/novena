// A damage estimate for Compare: damage per hit and per second against one enemy's DEF and RES, for normal attacks
// and, when it can be modelled exactly, with a skill active. Exact here means a sustained skill whose every effect on
// attacking is one of: ATK +x%, attack speed +x, or a damage multiplier per hit (the pipeline marks the rest with "x").
// Not counted: talents, module traits and talents, other operators' buffs, and damage over time; one target only.
import { statsAt, type BuildSpec } from "./stats";
import type { OpDetail } from "../types";

export type DamageType = "physical" | "arts" | "true" | "none";
export interface Foe { def: number; res: number }

/** The game's minimum: a hit always deals at least 5% of the attacker's ATK. */
const FLOOR = 0.05;

const plain = (html: string) => html.replace(/<[^>]+>/g, "");

/** What an operator's attacks deal, from its trait (the class trait, or the latest override it has at this elite). */
export function damageType(d: OpDetail, elite: number): DamageType {
  const override = (d.trait || []).filter((t) => t.elite <= elite && !t.pot).at(-1)?.desc;
  const text = plain(override || d.desc || "");
  if (/does not attack|cannot attack/i.test(text)) return "none";
  if (/arts damage/i.test(text)) return "arts";
  if (/true damage/i.test(text)) return "true";
  if (/restores? (the )?hp|heals?\b/i.test(text) && !/damage/i.test(text)) return "none"; // healers
  return "physical";
}

/** One hit of `atk` (times the skill's multiplier) against the enemy. */
export function hitDamage(atk: number, type: DamageType, foe: Foe): number {
  if (type === "physical") return Math.max(atk - foe.def, atk * FLOOR);
  if (type === "arts") return Math.max(atk * (1 - Math.min(foe.res, 100) / 100), atk * FLOOR);
  if (type === "true") return atk;
  return 0;
}

export interface DamageLine { hit: number; dps: number; interval: number }
export interface DamageEstimate {
  type: DamageType;
  normal: DamageLine | null; // null when it doesn't attack
  skill: DamageLine | { why: string } | null; // null: no skill chosen
}

export function damageAt(d: OpDetail, spec: BuildSpec, foe: Foe): DamageEstimate {
  const st = statsAt(d, spec);
  const type = damageType(d, spec.elite);
  if (type === "none" || !st.attackTime) return { type, normal: null, skill: null };
  const line = (atk: number, aspd: number, scale = 1): DamageLine => {
    const interval = (st.total.interval * 100) / Math.max(aspd, 10);
    const hit = hitDamage(atk * scale, type, foe);
    return { hit, dps: hit / interval, interval };
  };
  const normal = line(st.total.atk, st.total.aspd);
  const sk = spec.skill !== undefined ? d.skills[spec.skill] : undefined;
  if (!sk) return { type, normal, skill: null };
  const lv = sk.levels[Math.min(Math.max((spec.skillLevel || 7) - 1, 0), sk.levels.length - 1)];
  const why = lv.x ? "this skill has effects the estimate doesn't model"
    : !(lv.dur > 0) || sk.ammo || sk.sp === "passive" ? "only skills that last a while are modelled" : "";
  if (why) return { type, normal, skill: { why } };
  const bb = lv.bb || {};
  return { type, normal, skill: line(st.total.atk * (1 + (bb.atk || 0)), st.total.aspd + (bb.attack_speed || 0), bb.atk_scale || 1) };
}
