// The browser planner must pick the same steps as ako's make_plan on the same guides, roster and values
// (scripts/make_golden.py --planner writes the fixture).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import constTable from "../golden/const.json";
import { chance, decodeGuidebook, makePlan, raiseTo, type Guidebook, type GuidebookFile, type Req } from "../../src/lib/planner";
import type { Const, OpState } from "../../src/lib/costs";

const path = new URL("../golden/planner.json", import.meta.url);
const fixture = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;

describe.skipIf(!fixture)("planner matches ako", () => {
  it("starts from the same coverage and picks the same steps", () => {
    const r = makePlan({
      book: fixture.book, costs: fixture.costs, constTable: constTable as unknown as Const, values: fixture.values,
      roster: fixture.roster, available: fixture.available, shared: [], weights: fixture.weights, top: 8, support: 1, goals: {},
    });
    expect(r.startValue).toBeCloseTo(fixture.expected.start, 9);
    expect(r.steps.map((s) => s.id)).toEqual(fixture.expected.steps.map((s: any) => s.id));
    r.steps.forEach((s, i) => {
      const e = fixture.expected.steps[i];
      expect({ elite: s.after.elite, level: s.after.level, skillLevel: s.after.skillLevel, masteries: s.after.masteries })
        .toEqual({ elite: e.after.elite, level: e.after.level, skillLevel: e.after.skillLevel, masteries: e.after.masteries });
      expect(s.sanity).toBeCloseTo(e.sanity, 6);
      expect(s.gain).toBeCloseTo(e.gain, 9);
    });
    expect(r.endValue).toBeCloseTo(fixture.expected.end, 9);
  });
});

describe("guidebook file", () => {
  // the pipeline packs the same example in pipeline/tests/test_pipeline.py
  const rows: Guidebook["guides"] = [[0, 2.5, [[[0, 0]], [[1, 1], [2, 1]]]], [1, 1, [[[1, 1]]]], [0, 1.25, [[[1, 1]]]]];
  const tables = { chars: ["a", "b", "c"], stages: [["s0", "main"], ["s1", "event"]] as [string, string][], reqs: [] };
  it("unpacks to one row per guide in posting order", () => {
    const file: GuidebookFile = { ...tables, uses: [1, 1, 0, 0, 2, 1], stage: [0, 1, 0], weight: [2500, 1000, 1250], slots: [[1, [0, 2]], [0], [0]] };
    expect(decodeGuidebook(file).guides).toEqual(rows);
  });
  it.skipIf(!fixture)("plans the same from the packed file", () => {
    // weights to the 3 decimals the pipeline publishes (ako's are unrounded)
    const book: Guidebook = { ...fixture.book, guides: fixture.book.guides.map(([si, w, slots]: Guidebook["guides"][number]) => [si, Math.round(w * 1000) / 1000, slots]) };
    const count = new Map<string, number>();
    for (const [, , slots] of book.guides) for (const slot of slots) for (const o of slot) count.set(`${o}`, (count.get(`${o}`) || 0) + 1);
    const order = [...count].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const use = new Map(order.map((k, i) => [k, i]));
    const packed = book.guides.map(([, , slots]) => slots.map((s) => (s.length === 1 ? use.get(`${s[0]}`)! : s.map((o) => use.get(`${o}`)!))));
    const file: GuidebookFile = {
      chars: book.chars, stages: book.stages, reqs: book.reqs, uses: order.flatMap((k) => k.split(",").map(Number)),
      stage: book.guides.map((g) => g[0]), weight: book.guides.map((g) => Math.round(g[1] * 1000)),
      slots: book.stages.flatMap((_, si) => packed.filter((_, gi) => book.guides[gi][0] === si)),
    };
    const input = { costs: fixture.costs, constTable: constTable as unknown as Const, values: fixture.values, roster: fixture.roster,
      available: fixture.available, shared: [], weights: fixture.weights, top: 8, support: 1, goals: {} };
    expect(makePlan({ ...input, book: file })).toEqual(makePlan({ ...input, book }));
  });
});

describe("requirements", () => {
  const base: OpState = { elite: 2, level: 60, skillLevel: 7, masteries: [0, 0, 0], modules: { X: 0 } };
  const req: Req = { elite: 0, level: 0, skill: 3, sl: 0, module: "", mstage: 0, soft: [{ kind: 2, value: 3, miss: 0.02 }, { kind: 3, value: "X", miss: 0.4 }] };
  it("multiplies the misses of unmet soft parts", () => {
    expect(chance(base, req)).toBeCloseTo(0.02 * 0.4);
    expect(chance({ ...base, masteries: [0, 0, 3], modules: { X: 1 } }, req)).toBe(1);
  });
  it("hard requirements are all or nothing", () => {
    expect(chance({ ...base, elite: 1 }, { ...req, elite: 2, level: 1, soft: [] })).toBe(0);
  });
  it("raising to a mastery brings E2 and SL7", () => {
    const costs = { phases: [{ max: 50, cost: [], lmd: 0 }, { max: 80, cost: [], lmd: 0 }, { max: 90, cost: [], lmd: 0 }], skillUp: [],
      skills: [{ mastery: [] }, { mastery: [] }, { mastery: [] }], modules: [{ letter: "X", unlock: { elite: 2, level: 60 }, cost: [] }] };
    const s = raiseTo(costs as never, { elite: 1, level: 40, skillLevel: 4, masteries: [0, 0, 0], modules: { X: 0 } },
      { elite: 0, level: 0, skill: 2, sl: 10, module: "", mstage: 0, soft: [] }, []);
    expect(s).toEqual({ elite: 2, level: 1, skillLevel: 7, masteries: [0, 3, 0], modules: { X: 0 } });
  });
});
