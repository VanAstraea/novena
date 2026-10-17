// The enemy database's words and numbers: names for the game's codes, stat formatting, and the list's filters and
// sorting (all read from the page's address).
import { best } from "./search";
import { fmt } from "./format";
import type { EnemyRow, EnemyStagesFile, EnemyStats } from "../types";

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

export interface StageGroup { name: string; stages: { code: string; name: string; lv: number }[] }

/** The stages an enemy appears in, by story chapter, event or mode, in the game's order; each stage once. */
export function whereItAppears(file: EnemyStagesFile, id: string): StageGroup[] {
  const groups = new Map<number, StageGroup>();
  const seen = new Set<string>();
  for (const [si, lv] of file.by[id] || []) {
    const st = file.stages[si];
    if (!st) continue;
    const [code, name, g] = st;
    const key = `${g}|${code}|${lv}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!groups.has(g)) groups.set(g, { name: file.groups[g] || "Other", stages: [] });
    groups.get(g)!.stages.push({ code, name, lv });
  }
  return [...groups.values()];
}

/** A stage code as typed or as the game writes it, compared without case, spaces or dash styles ("ce 5" = "CE-5"). */
export const stageKey = (code: string) => code.toUpperCase().replace(/[\s_]+/g, "").replace(/[\u2010-\u2015\u2212]/g, "-");
const loose = (code: string) => stageKey(code).replace(/-/g, "");

export interface StageHit { code: string; name: string; group: string; enemies: Map<string, number[]>; index: number } // enemies: id -> levels; index: the first stage's place in the file

/** Every stage with that code (a code can repeat: Trials for Navigator's rounds), each with its enemies in the level
 *  file's order and the levels it uses; copies with the same code, name and group (other difficulty tiers) are one. The dash is optional ("15" finds "1-5" only when no
 *  stage is written "15"). */
export function stageHits(file: EnemyStagesFile, code: string): StageHit[] {
  const want = stageKey(code);
  if (!want) return [];
  let idx = file.stages.flatMap((st, i) => (stageKey(st[0]) === want ? [i] : []));
  if (!idx.length) idx = file.stages.flatMap((st, i) => (loose(st[0]) === loose(want) ? [i] : []));
  const hits = new Map<number, StageHit>();
  const byName = new Map<string, StageHit>();
  for (const i of idx) {
    const [c, name, g] = file.stages[i];
    const k = `${c}|${name}|${g}`;
    if (!byName.has(k)) byName.set(k, { code: c, name, group: file.groups[g] || "", enemies: new Map(), index: i });
    hits.set(i, byName.get(k)!);
  }
  for (const [id, entries] of Object.entries(file.by)) {
    for (const [si, lv] of entries) {
      const h = hits.get(si);
      if (!h) continue;
      const lvs = h.enemies.get(id) || [];
      if (!lvs.includes(lv)) h.enemies.set(id, [...lvs, lv].sort((a, b) => a - b));
    }
  }
  return [...byName.values()];
}

/** Up to `n` stage codes starting with what's typed, for when nothing matches exactly. */
export function stageSuggestions(file: EnemyStagesFile, code: string, n = 8): string[] {
  const want = stageKey(code);
  if (!want) return [];
  const out = new Set<string>();
  for (const [c] of file.stages) {
    if (stageKey(c).startsWith(want)) out.add(c);
    if (out.size >= n) break;
  }
  return [...out];
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
  stage: string; // a stage code: only the enemies it fields
  sort: SortKey | "";
  dir: 1 | -1;
}

export function readFilters(q: URLSearchParams): EnemyFilters {
  const sort = q.get("sort") || "";
  return {
    q: q.get("q") || "", level: q.get("level") || "", dmg: q.get("dmg") || "", atk: q.get("atk") || "", motion: q.get("motion") || "",
    imm: (q.get("imm") || "").split(",").filter(Boolean), stage: q.get("stage") || "",
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "", dir: q.get("dir") === "asc" ? 1 : -1,
  };
}

/** The enemies the filters let through: by name when searching, otherwise in handbook order or by the chosen stat
 *  (at the enemy's first level). `only`: a stage's enemies (id -> the levels it uses), which keeps those and shows
 *  them in the stage's order, sorted by their stats at the level the stage uses. */
export function filterEnemies(list: EnemyRow[], f: EnemyFilters, only?: Map<string, number[]>): EnemyRow[] {
  if (only) {
    const order = [...only.keys()];
    list = list.filter((e) => only.has(e.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  const lv = (e: EnemyRow) => e.lv[only?.get(e.id)?.[0] ?? 0] || e.lv[0];
  const out = list.filter((e) => (!f.level || e.level === f.level)
    && (!f.dmg || (f.dmg === "none" ? !e.dmg.length : e.dmg.includes(f.dmg as never)))
    && (!f.atk || e.atk === f.atk || (e.atk === "both" && (f.atk === "melee" || f.atk === "ranged")))
    && (!f.motion || e.motion === f.motion)
    && (!f.imm.length || f.imm.every((i) => immunities(e).includes(i))));
  if (f.q.trim()) return best(f.q, out, (e) => [e.name, e.code], 2000);
  if (!f.sort) return out;
  const key = f.sort;
  return [...out].sort((a, b) => (lv(a)[key] - lv(b)[key]) * f.dir || a.name.localeCompare(b.name));
}
