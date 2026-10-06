// What a module changes at each stage, in plain words, and where its card goes on screen. Shared by the module card
// (shown from any module icon), the operator panel and the operator page.
import type { Module, Stats } from "../types";

const STAT_NAMES: Record<string, string> = {
  hp: "HP", atk: "ATK", def: "DEF", res: "RES", cost: "DP cost", block: "Block", interval: "Attack interval", respawn: "Redeploy", aspd: "ASPD",
};
const ORDER = Object.keys(STAT_NAMES);
const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);

/** A stage's stat bonuses, in the game's order: "HP +180, ATK +100, DP cost −8". Empty when there are none. */
export function statText(attrs: Stats): string {
  return Object.entries(attrs).filter(([, v]) => v).sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, v]) => `${STAT_NAMES[k] || k.toUpperCase()} ${v! > 0 ? "+" : "−"}${Math.abs(v!)}${k === "interval" || k === "respawn" ? " s" : ""}`)
    .join(", ");
}

export interface StageChange { n: number; stats: string; trait: string[]; talents: { name: string; desc: string }[] }

/** What each stage brings. The data repeats the trait at every stage, so a trait the stage before already had is left
 *  out (stage 1 changes the trait, 2 and 3 usually keep it); talents are kept unless they're word for word the same. */
export function stageChanges(m: Module): StageChange[] {
  return m.stages.map((s, i) => {
    const prev = m.stages[i - 1];
    const sameTrait = !!prev && prev.trait.join("\n") === s.trait.join("\n");
    const before = new Set((prev?.talents || []).map((t) => `${t.name}\n${t.desc}`));
    return { n: i + 1, stats: statText(s.attrs), trait: sameTrait ? [] : s.trait, talents: s.talents.filter((t) => !before.has(`${t.name}\n${t.desc}`)) };
  });
}

/** The game's rich text as plain text. */
export const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** One line on a stage: "Stage 3: ATK +60, DEF +45 · improves Frugality", or the new trait for stage 1. */
export function stageSummary(m: Module, stage: number): string {
  const c = stageChanges(m)[stage - 1];
  if (!c) return "";
  const parts = [c.stats, ...c.trait.map((t) => `trait: ${plain(t)}`), c.talents.length ? `improves ${c.talents.map((t) => t.name).join(" and ")}` : ""].filter(Boolean);
  return `Stage ${stage}: ${parts.join(" · ") || "no changes listed"}`;
}

interface Box { top: number; bottom: number; left: number; right: number }

/** Where a popover goes beside the element that opened it: below when it fits, above when there's more room there,
 *  centred on the element but kept `margin` px inside the window. `maxH` caps its height to the side it's on. */
export function placePopover(anchor: Box, size: { w: number; h: number }, view: { w: number; h: number }, gap = 6, margin = 8): { top: number; left: number; above: boolean; maxH: number } {
  const below = view.h - anchor.bottom - gap - margin, aboveRoom = anchor.top - gap - margin;
  const above = size.h > below && aboveRoom > below;
  const maxH = Math.max(80, above ? aboveRoom : below);
  const h = Math.min(size.h, maxH);
  const top = above ? anchor.top - gap - h : anchor.bottom + gap;
  const centre = (anchor.left + anchor.right) / 2 - size.w / 2;
  const left = Math.max(margin, Math.min(centre, view.w - size.w - margin));
  return { top: Math.round(top), left: Math.round(left), above, maxH: Math.floor(maxH) };
}
