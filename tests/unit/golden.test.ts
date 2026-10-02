// The TypeScript ports must give the same numbers as ako's Python on the same inputs (scripts/make_golden.py).
import { describe, expect, it } from "vitest";
import ops from "../golden/ops.json";
import constTable from "../golden/const.json";
import costCases from "../golden/costs.json";
import recipes from "../golden/recipes.json";
import craftCases from "../golden/crafting.json";
import stages from "../golden/stages.json";
import farmCases from "../golden/farming.json";
import pool from "../golden/recruit_pool.json";
import recruitCases from "../golden/recruit.json";
import { growthCost, masteryCost, moduleCost, skillLevelCost } from "../../src/lib/costs";
import { Stock } from "../../src/lib/crafting";
import { plan } from "../../src/lib/farming";
import { combos, worthPicking } from "../../src/lib/recruit";
import type { OpDetail, Recipe, RecruitFile, StageRow } from "../../src/types";

const details = ops as unknown as Record<string, OpDetail>;
const C = constTable as unknown as Parameters<typeof growthCost>[1];

describe("costs match ako", () => {
  for (const [cid, expected] of Object.entries(costCases as Record<string, any>)) {
    const d = details[cid];
    it(cid, () => {
      const caps = d.phases.map((p) => p.max);
      const top = caps.length - 1;
      expect(growthCost(d, C, 0, 1, top, caps[top])).toEqual(expected.growth);
      expect(growthCost(d, C, 0, 15, Math.min(1, top), caps[Math.min(1, top)] - 5)).toEqual(expected.growth_mid);
      expect(skillLevelCost(d, 1, 7)).toEqual(expected.skill_levels);
      expect(d.skills.map((_, i) => masteryCost(d, i, 0, 3))).toEqual(expected.masteries);
      expect(Object.fromEntries(d.modules.map((m) => [m.letter, moduleCost(d, m.letter, 0, 3)]))).toEqual(expected.modules);
    });
  }
});

describe("crafting matches ako", () => {
  (craftCases as any[]).forEach((c, i) => {
    it(`case ${i + 1}`, () => {
      const stock = new Stock(c.inventory, recipes as unknown as Record<string, Recipe>);
      expect(stock.pay(c.cost)).toEqual(c.short);
      const after = Object.fromEntries(Object.entries(stock.items).filter(([, v]) => v));
      expect(after).toEqual(c.after);
    });
  });
});

describe("farming LP matches ako's optimum", () => {
  (farmCases as any[]).forEach((c, i) => {
    it(`case ${i + 1}`, async () => {
      const p = await plan(c.need, c.inventory, stages as unknown as StageRow[], recipes as unknown as Record<string, Recipe>);
      expect(p.sanity).toBeCloseTo(c.sanity, 3);
      expect(p.unmet).toEqual(c.unmet);
      expect(p.lmdShort).toBe(c.lmd_short);
      expect(p.expShort).toBe(c.exp_short);
    });
  });
});

describe("recruitment matches ako", () => {
  (recruitCases as any[]).forEach((c, i) => {
    it(`tag set ${i + 1}`, () => {
      const found = combos(c.tags, pool as unknown as RecruitFile);
      const norm = (xs: any[]) => xs.map((x) => JSON.stringify([x.tags, x.rarity, x.candidates])).sort();
      expect(norm(found.map((f) => ({ tags: [...f.tags].sort((a, b) => a - b), rarity: f.rarity,
        candidates: f.candidates.map((x) => x.id).sort() }))))
        .toEqual(norm(c.combos.map((x: any) => ({ ...x, tags: [...x.tags].sort((a: number, b: number) => a - b) }))));
      const worth = worthPicking(found).map((w) => [...w.tags].sort((a, b) => a - b));
      expect(worth.map((w) => w.join()).sort()).toEqual(c.worth.map((w: number[]) => [...w].sort((a, b) => a - b).join()).sort());
    });
  });
});
