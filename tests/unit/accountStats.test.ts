// Account at a glance (Today): the counts, what the roster has cost so far, and the cost to max everything.
import { describe, expect, it } from "vitest";
import ops from "../golden/ops.json";
import constTable from "../golden/const.json";
import costCases from "../golden/costs.json";
import { accountStats, band, maxRows, maxTotal, PARTS, summary, topMaterials } from "../../src/lib/accountStats";
import { add, EXP, LMD, type Const, type Cost, type CostData } from "../../src/lib/costs";
import type { RosterOp } from "../../src/state";
import type { OpDetail, OpIndex } from "../../src/types";

const details = ops as unknown as Record<string, CostData & OpDetail>;
const C = constTable as unknown as Const;
const golden = costCases as Record<string, any>;
const index = (id: string, rarity: number, patch = false) => ({ id, name: id, rarity, patch } as unknown as OpIndex);
const INDEX = new Map<string, OpIndex>([
  ["char_202_demkni", index("char_202_demkni", 6)], // Saria
  ["char_151_myrtle", index("char_151_myrtle", 4)],
  ["char_120_hibisc", index("char_120_hibisc", 3)],
  ["char_1028_texas2", index("char_1028_texas2", 6)],
]);
const blank = (id: string): RosterOp => ({ id, elite: 0, level: 1, pot: 1, skillLevel: 1, masteries: details[id].skills.map(() => 0), modules: {} });
/** Everything golden says it takes from E0 L1 to the top. */
function everything(id: string): Cost {
  const g = golden[id];
  const out: Cost = {};
  add(out, g.growth); add(out, g.skill_levels);
  g.masteries.forEach((m: Cost) => add(out, m));
  Object.values(g.modules).forEach((m) => add(out, m as Cost));
  return out;
}
function maxed(id: string): RosterOp {
  const d = details[id];
  const top = d.phases.length - 1;
  return { id, elite: top, level: d.phases[top].max, pot: 6, skillLevel: d.skillUp.length + 1, masteries: d.skills.map((s) => s.mastery.length),
    modules: Object.fromEntries(d.modules.map((m) => [m.letter, m.cost.length])) };
}

describe("account stats", () => {
  it("counts by rarity, promotion, skills, modules and potential", () => {
    const saria = maxed("char_202_demkni");
    const myrtle: RosterOp = { ...blank("char_151_myrtle"), elite: 1, level: 20, pot: 3 };
    const hibiscus = maxed("char_120_hibisc");
    const s = accountStats([saria, myrtle, hibiscus], INDEX, details, C);
    expect(s.owned).toBe(3);
    expect(s.byBand).toEqual({ 6: 1, 5: 0, 4: 1, low: 1 });
    expect(s.e2).toBe(1);
    expect(s.levelMax).toBe(2); // Saria at E2 90 and Hibiscus at her E1 cap
    expect(s.sl7).toBe(2);
    expect(s.m3).toBe(saria.masteries.length);
    expect(s.m3Ops).toBe(1);
    expect(s.modules).toBe(Object.keys(saria.modules).length);
    expect(s.modules3).toBe(Object.keys(saria.modules).length);
    expect(s.pot6).toBe(2);
  });

  it("prices a maxed operator the same as the golden costs from E0 L1", () => {
    const s = accountStats([maxed("char_202_demkni")], INDEX, details, C);
    expect(s.invested).toEqual(everything("char_202_demkni"));
  });

  it("books nothing for a fresh operator and counts alternate forms once", () => {
    const alt = new Map(INDEX).set("char_1028_texas2", index("char_1028_texas2", 6, true));
    const s = accountStats([blank("char_202_demkni"), { ...maxed("char_1028_texas2"), masteries: [0, 0, 0], modules: {} }], alt, details, C);
    expect(s.owned).toBe(1);
    expect(s.invested).toEqual({}); // the alternate form's promotion and levels belong to its base form
  });
});

describe("cost to max everything", () => {
  it("adds up every part from E0 L1 to golden", () => {
    const rows = maxRows([blank("char_202_demkni")], INDEX, details, C);
    expect(maxTotal(rows, PARTS, ["6", "5", "4", "low"]).cost).toEqual(everything("char_202_demkni"));
    expect(maxTotal(rows, ["growth"], ["6"]).cost).toEqual(golden.char_202_demkni.growth);
    expect(maxTotal(rows, ["skills"], ["6"]).cost).toEqual(golden.char_202_demkni.skill_levels);
  });

  it("is zero for a maxed operator, and filters by rarity", () => {
    const rows = maxRows([maxed("char_202_demkni"), blank("char_151_myrtle")], INDEX, details, C);
    const all = maxTotal(rows, PARTS, ["6", "5", "4", "low"]);
    expect(all.counted).toBe(2);
    expect(all.toRaise).toBe(1);
    const six = maxTotal(rows, PARTS, ["6"]);
    expect(six).toEqual({ cost: {}, toRaise: 0, counted: 1 });
    expect(maxTotal(rows, PARTS, ["4"]).cost).toEqual(everything("char_151_myrtle"));
  });

  it("starts from where the operator is", () => {
    const saria = { ...maxed("char_202_demkni"), masteries: [3, 3, 2] };
    const rows = maxRows([saria], INDEX, details, C);
    expect(maxTotal(rows, PARTS, ["6"]).cost).toEqual(Object.fromEntries(details.char_202_demkni.skills[2].mastery[2].cost));
  });
});

describe("helpers", () => {
  it("bands rarities", () => {
    expect([6, 5, 4, 3, 2, 1].map(band)).toEqual(["6", "5", "4", "low", "low", "low"]);
  });
  it("picks the materials worth the most, leaving out LMD and EXP", () => {
    const cost = { [LMD]: 1e6, [EXP]: 1e6, a: 10, b: 1, c: 5 };
    expect(topMaterials(cost, { a: 1, b: 50, c: 3 }, 2)).toEqual([["b", 1], ["c", 5]]);
    expect(summary(cost, { [LMD]: 0.004, a: 1 })).toEqual({ lmd: 1e6, exp: 1e6, sanity: 4010 });
  });
});
