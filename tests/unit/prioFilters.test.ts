import { describe, expect, it } from "vitest";
import { filtersOn, NO_FILTERS, planFilters, readFilters, type PrioFilters } from "../../src/lib/prioFilters";

const ops = new Map([
  ["amiya", { rarity: 5, cls: "CASTER" }],
  ["texas", { rarity: 5, cls: "PIONEER" }],
  ["saria", { rarity: 6, cls: "TANK" }],
  ["myrtle", { rarity: 4, cls: "PIONEER" }],
  ["fang", { rarity: 3, cls: "PIONEER" }],
  ["lancet", { rarity: 1, cls: "MEDIC" }],
]);
const owned = [...ops.keys()];
const only = (f: Partial<PrioFilters>) => planFilters({ ...NO_FILTERS, ...f }, owned, ops).only;

describe("priority filters", () => {
  it("leave the planner alone when nothing is set", () => {
    expect(filtersOn(NO_FILTERS)).toBe(false);
    expect(planFilters(NO_FILTERS, owned, ops)).toEqual({});
  });
  it("leave out operators by name", () => {
    expect(only({ skip: ["amiya", "saria"] })).toEqual(["texas", "myrtle", "fang", "lancet"]);
  });
  it("leave out whole rarities, 3★ taking in 1★ and 2★", () => {
    expect(only({ skipRarity: [3] })).toEqual(["amiya", "texas", "saria", "myrtle"]);
    expect(only({ skipRarity: [6, 5] })).toEqual(["myrtle", "fang", "lancet"]);
  });
  it("combine operators, rarities and classes", () => {
    expect(only({ skip: ["texas"], skipRarity: [3], cls: ["PIONEER"] })).toEqual(["myrtle"]);
  });
  it("count as filtered with only a rarity left out", () => {
    expect(filtersOn({ ...NO_FILTERS, skipRarity: [4] })).toBe(true);
  });
  it("skip ids the operator list doesn't know", () => {
    expect(planFilters({ ...NO_FILTERS, skip: ["amiya"] }, [...owned, "char_new"], ops).only).not.toContain("char_new");
  });
  it("keep the kinds and the sanity cap", () => {
    const kinds = { ...NO_FILTERS.kinds, module: false };
    expect(planFilters({ ...NO_FILTERS, kinds, maxSanity: 1000 }, owned, ops)).toEqual({ only: owned, kinds, maxSanity: 1000 });
  });
});

describe("saved priority filters", () => {
  it("fill in what older saves lack", () => {
    expect(readFilters({})).toEqual(NO_FILTERS);
    expect(readFilters({ skip: ["amiya"], kinds: { promote: false } as PrioFilters["kinds"] })).toEqual({ ...NO_FILTERS, skip: ["amiya"], kinds: { ...NO_FILTERS.kinds, promote: false } });
  });
  it("turn the old rarities-to-keep into rarities left out", () => {
    const f = readFilters({ rarity: [6, 5] });
    expect(f.skipRarity.sort()).toEqual([3, 4]);
    expect(f).not.toHaveProperty("rarity");
    expect(readFilters({ rarity: [] }).skipRarity).toEqual([]);
  });
});
