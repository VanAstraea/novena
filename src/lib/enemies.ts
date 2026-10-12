// The enemy database's words and numbers: names for the game's codes, stat formatting, and the list's filters and
// sorting (all read from the page's address).
import { best } from "./search";
import { fmt } from "./format";
import type { EnemyRow, EnemyStats } from "../types";

export const LEVEL_NAMES: Record<EnemyRow["level"], string> = { NORMAL: "Normal", ELITE: "Elite", BOSS: "Boss" };
export const DAMAGE_NAMES: Record<string, string> = { physical: "Physical", arts: "Arts", healing: "Healing" };
export const ATTACK_NAMES: Record<EnemyRow["atk"], string> = { melee: "Melee", ranged: "Ranged", both: "Melee and ranged", none: "Doesn't attack" };
export const MOTION_NAMES: Record<EnemyRow["motion"], string> = { walk: "Ground", fly: "Flying" };
/** Immunities in the game's order, with the glossary term that explains each (where the game has one). */
export const IMMUNITIES: { id: string; name: string; term?: string }[] = [
  { id: "stun", name: "Stun", term: "ba.stun" }, { id: "silence", name: "Silence" }, { id: "sleep", name: "Sleep", term: "ba.sleep" },
  { id: "frozen", name: "Frozen", term: "ba.frozen" }, { id: "levitate", name: "Levitate", term: "ba.levitate" },
  { id: "fear", name: "Fear", term: "ba.fear" }, { id: "palsy", name: "Paralysis", term: "ba.palsy" },
  { id: "attract", name: "Lure", term: "ba.attract" }, { id: "disarm", name: "Disarmed Combat" },
];
export const immunityName = (id: string) => IMMUNITIES.find((i) => i.id === id)?.name || id;

/** The stats the list sorts by, and every stat the enemy page shows, in order. */
export const SORTS = ["hp", "atk", "def", "res", "wt"] as const;
export type SortKey = (typeof SORTS)[number];
export const STATS: { key: keyof Omit<EnemyStats, "imm">; label: string; title?: string; optional?: boolean }[] = [
  { key: "hp", label: "HP" }, { key: "atk", label: "ATK" }, { key: "def", label: "DEF" }, { key: "res", label: "RES" },
  { key: "erst", label: "Elemental resistance", title: "Lowers how fast elemental damage builds up", optional: true },
  { key: "edr", label: "Elemental damage resistance", title: "Lowers the damage of an elemental burst", optional: true },
  { key: "wt", label: "Weight", title: "Heavier enemies are harder to push, pull and lift" },
  { key: "spd", label: "Move speed" }, { key: "rng", label: "Range", title: "Attack range in tiles" },
  { key: "int", label: "Attack interval", title: "Seconds between attacks" },
  { key: "lp", label: "Life Points lost", title: "Life Points it costs you if it reaches the goal" },
];

/** One stat, written for reading: thousands separated, seconds and tiles marked, a dash where it doesn't apply. */
export function statText(key: string, v: number | undefined): string {
  if (v === undefined) return "–";
  if (key === "hp" || key === "atk" || key === "def") return fmt(v);
  if (key === "rng") return v > 0 ? `${v}` : "–";
  if (key === "int") return v > 0 ? `${v} s` : "–";
  return `${v}`;
}

export const damageText = (dmg: EnemyRow["dmg"]) => (dmg.length ? dmg.map((d) => DAMAGE_NAMES[d] || d).join(" and ") : "None");

/** Immunities any of its levels has (the list filters on these). */
export const immunities = (e: EnemyRow) => [...new Set(e.lv.flatMap((l) => l.imm))];

/** Whether a stat changes between the enemy's levels (the enemy page marks those rows). */
export const varies = (e: EnemyRow, key: keyof EnemyStats) => new Set(e.lv.map((l) => JSON.stringify(l[key] ?? null))).size > 1;

export interface EnemyFilters {
  q: string;
  level: string;
  dmg: string; // physical, arts, healing, or none
  atk: string;
  motion: string;
  imm: string[]; // immune to all of these
  sort: SortKey | "";
  dir: 1 | -1;
}

export function readFilters(q: URLSearchParams): EnemyFilters {
  const sort = q.get("sort") || "";
  return {
    q: q.get("q") || "", level: q.get("level") || "", dmg: q.get("dmg") || "", atk: q.get("atk") || "", motion: q.get("motion") || "",
    imm: (q.get("imm") || "").split(",").filter(Boolean),
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "", dir: q.get("dir") === "asc" ? 1 : -1,
  };
}

/** The enemies the filters let through: by name when searching, otherwise in handbook order or by the chosen stat
 *  (at the enemy's first level). */
export function filterEnemies(list: EnemyRow[], f: EnemyFilters): EnemyRow[] {
  const out = list.filter((e) => (!f.level || e.level === f.level)
    && (!f.dmg || (f.dmg === "none" ? !e.dmg.length : e.dmg.includes(f.dmg as never)))
    && (!f.atk || e.atk === f.atk || (e.atk === "both" && (f.atk === "melee" || f.atk === "ranged")))
    && (!f.motion || e.motion === f.motion)
    && (!f.imm.length || f.imm.every((i) => immunities(e).includes(i))));
  if (f.q.trim()) return best(f.q, out, (e) => [e.name, e.code], 2000);
  if (!f.sort) return out;
  const key = f.sort;
  return [...out].sort((a, b) => (a.lv[0][key] - b.lv[0][key]) * f.dir || a.name.localeCompare(b.name));
}
