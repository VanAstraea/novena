// What you play (after ako's content weights): how much each kind of content counts when the Plan scores upgrades and
// when Rankings' "All" ranks operators. Each kind gets Off, Less, Normal or More on top of the default mix
// (events 35%, main story 25%, CC 20%, Annihilation 10%, supply and other 5% each). Kept in this browser.
import { signal } from "@preact/signals";
import type { Category } from "../types";
import { pref, setPref } from "./storage";

export const DEFAULT_WEIGHTS: Record<Category, number> = { main: 0.25, event: 0.35, annihilation: 0.1, cc: 0.2, supply: 0.05, other: 0.05 };
export const LEVELS: [number, string][] = [[0, "Off"], [0.5, "Less"], [1, "Normal"], [2, "More"]];
export const CATEGORY_ORDER: Category[] = ["event", "main", "cc", "annihilation", "supply", "other"];

const read = (): Partial<Record<Category, number>> => { try { return JSON.parse(pref("weights", "{}")); } catch { return {}; } };
export const contentLevels = signal<Partial<Record<Category, number>>>(read());

export function setLevel(cat: Category, level: number): void {
  const next = { ...contentLevels.value, [cat]: level };
  if (level === 1) delete next[cat];
  contentLevels.value = next;
  setPref("weights", JSON.stringify(next));
}

export const customised = () => Object.keys(contentLevels.value).length > 0;

/** The weights in use: the default mix times each kind's level. */
export function effectiveWeights(): Record<Category, number> {
  const out = { ...DEFAULT_WEIGHTS };
  for (const [c, l] of Object.entries(contentLevels.value)) out[c as Category] *= l as number;
  return out;
}

/** An operator's (or archetype's) usage across kinds, weighted to what you play. */
export function weightedScore(u: Partial<Record<Category, number>> | undefined): number {
  if (!u) return 0;
  const w = effectiveWeights();
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return Object.entries(w).reduce((s, [c, x]) => s + x * (u[c as Category] || 0), 0) / total;
}
