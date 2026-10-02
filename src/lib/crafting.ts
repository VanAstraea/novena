// A depot that pays for upgrades, crafting missing materials when it can (ported from ako's crafting.py).
// Crafting happens one craft at a time and only when the whole craft can be paid for, so a shortfall names the
// material the upgrade asked for ("3 × D32 Steel"), not a scatter of low-tier ingredients. Workshop byproducts are
// ignored, which makes this slightly pessimistic.
import type { Recipe } from "../types";
import type { Cost } from "./costs";

export const EXP_CARDS: Record<string, number> = { "2001": 200, "2002": 400, "2003": 1000, "2004": 2000 };
const MAX_DEPTH = 6;

export class Stock {
  items: Record<string, number>;
  crafted: Record<string, number> = {};

  constructor(inventory: Record<string, number>, private recipes: Record<string, Recipe>) {
    this.items = { ...inventory };
    // Battle records pool into plain EXP, which is what level costs are expressed in.
    let exp = this.items.EXP || 0;
    for (const [card, value] of Object.entries(EXP_CARDS)) {
      exp += (this.items[card] || 0) * value;
      delete this.items[card];
    }
    if (exp) this.items.EXP = exp;
  }

  /** Pay `cost` if possible (crafting as needed) and return {}. If it can't be paid in full, nothing is spent and
   * the shortfall is returned. */
  pay(cost: Cost): Cost {
    const trial = { ...this.items };
    const crafted: Record<string, number> = {};
    const short: Cost = {};
    for (const [item, count] of Object.entries(cost)) {
      const missing = this.take(trial, item, count, 0, crafted);
      if (missing) short[item] = missing;
    }
    if (!Object.keys(short).length) {
      this.items = trial;
      for (const [k, v] of Object.entries(crafted)) this.crafted[k] = (this.crafted[k] || 0) + v;
    }
    return short;
  }

  private take(stock: Record<string, number>, item: string, count: number, depth: number, crafted: Record<string, number>): number {
    const have = Math.min(stock[item] || 0, count);
    stock[item] = (stock[item] || 0) - have;
    let missing = count - have;
    const recipe = this.recipes[item];
    while (missing > 0 && recipe && depth < MAX_DEPTH) {
      const attempt = { ...stock };
      const attemptCrafted = { ...crafted };
      const ok = this.take(attempt, "4001", recipe.lmd, depth + 1, attemptCrafted) === 0
        && recipe.costs.every(([ing, n]) => this.take(attempt, ing, n, depth + 1, attemptCrafted) === 0);
      if (!ok) break;
      for (const k of Object.keys(stock)) delete stock[k];
      Object.assign(stock, attempt);
      for (const k of Object.keys(crafted)) delete crafted[k];
      Object.assign(crafted, attemptCrafted);
      const made = Math.min(recipe.count, missing);
      stock[item] = (stock[item] || 0) + recipe.count - made;
      crafted[item] = (crafted[item] || 0) + 1;
      missing -= made;
    }
    return missing;
  }
}

/** Expand a cost into what it takes from scratch: craftable items become their ingredients, down to `maxDepth`
 * (used for "what to craft from lower tiers"). */
export function breakdown(cost: Cost, recipes: Record<string, Recipe>, craftable: (id: string) => boolean): {
  base: Cost; crafts: Record<string, number>;
} {
  const base: Cost = {};
  const crafts: Record<string, number> = {};
  const visit = (item: string, n: number, depth: number) => {
    const r = recipes[item];
    if (!r || depth >= MAX_DEPTH || !craftable(item)) {
      base[item] = (base[item] || 0) + n;
      return;
    }
    const times = Math.ceil(n / r.count);
    crafts[item] = (crafts[item] || 0) + times;
    if (r.lmd) base["4001"] = (base["4001"] || 0) + r.lmd * times;
    for (const [ing, k] of r.costs) visit(ing, k * times, depth + 1);
  };
  for (const [item, n] of Object.entries(cost)) visit(item, n, 0);
  return { base, crafts };
}
