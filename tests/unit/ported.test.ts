import { describe, expect, it } from "vitest";
import { sanityAt } from "../../src/lib/sanity";
import { gameOrder, movesFrom, shiftBySlot, type BaseFile, type BaseLayout, type Room, type Team } from "../../src/lib/base";
import { expiring, held, tokenUse, voucherPicks } from "../../src/lib/consumables";
import type { CostData } from "../../src/lib/costs";
import { dormPlan, drains, lasts } from "../../src/lib/morale";
import { diff } from "../../src/lib/progress";
import { bestTrainers, hm, trainersByClass, workshopPicks } from "../../src/lib/training";
import type { RosterOp } from "../../src/state";
import type { ItemsFile, OpIndex, UsageFile } from "../../src/types";

const op = (id: string, rarity: number, cls = "SNIPER", branch = "fastshot", patch?: string) =>
  ({ id, name: id, rarity, cls, branch, pos: "RANGED", tags: [], factions: [], obtain: "", recruit: false, on: ["en"], mods: [], modIds: [], patch }) as unknown as OpIndex;
const r = (id: string, elite = 2, level = 1, masteries: number[] = [0, 0, 0], pot = 1): RosterOp => ({ id, elite, level, pot, skillLevel: 7, masteries, modules: {} });

const DATA = {
  ops: {
    trainer: [[["bskill_train_sniper", 0, 1], ["bskill_train_sniper2", 2, 1]]],
    shop: [[["bskill_ws_any", 0, 1]]],
    worker: [[["bskill_tra_tired", 0, 1]]],
    sleeper: [[["bskill_dorm_all", 0, 1]]],
  },
  rooms: {}, control: {}, names: {},
  train: { bskill_train_sniper: [30, ["SNIPER"], null, null, 0], bskill_train_sniper2: [30, ["SNIPER"], "fastshot", null, 40] },
  workshop: { bskill_ws_any: ["Any material", 70] },
  morale: { Trade: { bskill_tra_tired: [0.5, 0, 0] } },
  dorm: { bskill_dorm_all: [0.15, 0, 0, 0.01] },
} as unknown as BaseFile;

describe("Training Room and Workshop", () => {
  const roster = { trainer: r("trainer", 2, 1), shop: r("shop", 0, 1), trainee: r("trainee") };
  it("picks the fastest trainer, counting branch extras", () => {
    const [t] = bestTrainers(DATA, roster, op("trainee", 6), 3, 24);
    expect(t).toMatchObject({ id: "trainer", speed: 70 });
    expect(hm(t.hours)).toBe("14 h 07 m");
    expect(bestTrainers(DATA, roster, op("trainee", 6, "CASTER"), 3, 24)).toEqual([]);
  });
  it("lists trainers by class and Workshop picks", () => {
    expect(trainersByClass(DATA, roster).SNIPER[2]).toEqual({ id: "trainer", speed: 30 });
    expect(workshopPicks(DATA, roster)).toEqual([["Any material", [{ id: "shop", pct: 70 }]]]);
  });
});

describe("morale and dorms", () => {
  const skills = new Map([["worker", new Set(["bskill_tra_tired"])], ["sleeper", new Set(["bskill_dorm_all"])], ["other", new Set<string>()]]);
  const trade: Room = { facility: "Trade", product: "Money", slots: 3 };
  const shiftA: [Room, Team][] = [[trade, { members: ["worker"], efficiency: 0 }]];
  const shiftB: [Room, Team][] = [[trade, { members: ["other"], efficiency: 0 }]];
  it("drains at the room's rate plus the operator's own skills", () => {
    const d = drains(DATA, skills, shiftA)[0];
    expect(d.worker).toBeCloseTo(1.4);
    expect(lasts(d)).toBeCloseTo(24 / 1.4);
  });
  it("rests the other shift, with the best dorm helper", () => {
    const plan = dormPlan(DATA, skills, [shiftA, shiftB], 1, ["worker", "other", "sleeper"], { dorms: 1, beds: 5, level: 5, ambience: 5000 });
    expect(plan.dorms[0].helpers).toEqual([{ id: "sleeper", kind: "everyone", value: 0.2 }]);
    expect(plan.dorms[0].resting.map((x) => x.id)).toEqual(["worker"]);
    expect(plan.dorms[0].resting[0].used).toBeCloseTo(1.4 * 12);
    expect(plan.dorms[0].rate).toBeCloseTo(4.2);
  });
});

describe("base map", () => {
  const layout: BaseLayout = { rows: 4, cols: 8, passages: [], annex: [], capacity: {},
    slots: { slot_a: [2, 4, 2, 4, "B1"], slot_b: [2, 0, 2, 4, "B1"], slot_c: [0, 0, 2, 4, "1F"] } };
  const rooms = [
    { slot: "slot_a", room: "TRADING", team: [{ charId: "x" }] },
    { slot: "slot_b", room: "TRADING", team: [{ charId: "y" }] },
    { slot: "slot_c", room: "MANUFACTURE", team: [] },
  ];
  it("orders rooms top floor first, then left to right", () => {
    expect(gameOrder(rooms, layout).map((r) => r.slot)).toEqual(["slot_c", "slot_b", "slot_a"]);
  });
  it("lays a shift's rooms onto yours in that order and counts who moves", () => {
    const t1: Room = { facility: "Trade", product: "Money", slots: 1 };
    const t2: Room = { facility: "Trade", product: "Money", slots: 1 };
    const shift: [Room, Team][] = [[t1, { members: ["y"], efficiency: 30 }], [t2, { members: ["z"], efficiency: 20 }]];
    const planned = shiftBySlot(shift, gameOrder(rooms, layout));
    expect(planned.get("slot_b")?.[0]).toBe(t1);
    expect(planned.get("slot_a")?.[0]).toBe(t2);
    expect(planned.has("slot_c")).toBe(false);
    expect(movesFrom(planned, rooms)).toBe(1); // y stays put, z moves in
  });
});

const COSTS: CostData = {
  phases: [{ max: 50, cost: [], lmd: 0 }, { max: 80, cost: [["30013", 4]], lmd: 30000 }, { max: 90, cost: [["30073", 3]], lmd: 180000 }],
  skillUp: [], skills: [{ mastery: [{ cost: [["3303", 4]], hours: 8 }, { cost: [["3303", 8]], hours: 16 }, { cost: [["3303", 12]], hours: 24 }] }], modules: [],
};
const CONST = { maxLevel: [[30, 40, 45], [30, 40, 45], [40, 55, 60], [45, 60, 70], [50, 70, 80], [50, 80, 90]], characterExpMap: [Array(90).fill(100), Array(90).fill(100), Array(90).fill(100)], characterUpgradeCostMap: [Array(90).fill(10), Array(90).fill(10), Array(90).fill(10)], evolveGoldCost: [] } as never;

describe("progress", () => {
  it("prices each change", () => {
    const p = diff({ roster: { a: r("a", 2, 1, [1]) }, depot: { "30073": 5 } }, { roster: { a: r("a", 2, 1, [3]), b: r("b", 0, 1, [0]) }, depot: { "30073": 2 } },
      { a: COSTS, b: COSTS }, CONST, new Map([["a", op("a", 6)], ["b", op("b", 6)]]));
    const mastery = p.changes.find((c) => c.id === "a" && c.kind === "mastery")!;
    expect(mastery).toMatchObject({ before: "S1 M1", after: "S1 M3", cost: { "3303": 20 } });
    expect(p.changes.find((c) => c.id === "b")?.kind).toBe("new");
    expect(p.depot).toEqual({ "30073": -3 });
  });
});

describe("items to use", () => {
  const items = {
    items: { v6: { name: "M3 voucher", type: "VOUCHER_SKILL_SPECIALLEVELMAX_6", sort: 1 }, ap: { name: "Potion", type: "AP_SUPPLY", ap: 100 }, tier6_sniper: { name: "6★ Sniper token" } },
    values: { "3303": 5 }, recipes: {}, corrections: {}, potential: { "6": { SNIPER: "tier6_sniper" } },
  } as unknown as ItemsFile;
  const usage = { ops: { a: { u: {}, inv: { own: 1, e2: 1, m3: { 1: 0.9 }, mod: {}, mod3: {} }, build: {} }, b: { build: {} } } } as unknown as UsageFile;
  const ops = new Map([["a", op("a", 6)], ["b", op("b", 6)], ["c", op("c", 5)]]);
  it("ranks voucher picks: planned first, then players' rate", () => {
    const roster = { a: r("a", 2, 1, [0]), b: r("b", 2, 1, [0]), c: r("c", 2, 1, [0]) };
    const picks = voucherPicks("v6", items, roster, ops, { a: COSTS, b: COSTS, c: COSTS }, CONST, usage, {});
    expect(picks.map((p) => p.id)).toEqual(["a", "b"]);
    const planned = voucherPicks("v6", items, roster, ops, { a: COSTS, b: COSTS, c: COSTS }, CONST, usage, { b: { elite: 2, level: 1, skillLevel: 7, masteries: [3], modules: {} } });
    expect(planned[0]).toMatchObject({ id: "b", planned: true, upgrade: "S1 M0 → M3", sanity: 120 });
  });
  it("says who a potential token is for", () => {
    const x = new Map([["char_x", op("char_x", 6)]]);
    expect(tokenUse("p_char_x", items, { char_x: r("char_x", 2, 1, [0], 3) }, x, (c) => c)).toEqual({ target: "char_x", note: "Potential 3 → 4", ready: true });
    expect(tokenUse("class_p_char_x", items, {}, x, (c) => c)?.note).toBe("not in your roster yet");
    expect(tokenUse("tier6_sniper", items, { a: r("a"), b: r("b", 2, 1, [0], 6) }, ops, () => "Sniper")?.note).toBe("for a");
  });
  it("sorts what expires and keeps the rest", () => {
    const a = { ops: {}, depot: {}, updated: 0, snapshots: [], consumables: { ap: [{ count: 2, ts: 2_000_000_000 }, { count: 1, ts: 1_000 }], v6: [{ count: 1, ts: -1 }] } };
    expect(expiring(a, items, 1_700_000_000_000)).toEqual([{ id: "ap", count: 2, ts: 2_000_000_000, sanity: 200 }]);
    expect(held(a)).toEqual({ v6: 1 });
  });
});

describe("sanity timer", () => {
  it("regenerates a point every six minutes up to the cap", () => {
    const at = 1_000_000;
    expect(sanityAt({ value: 100, cap: 135, at, notify: false }, at + 60 * 60_000)).toEqual({ now: 110, fullAt: at + 35 * 6 * 60_000 });
    expect(sanityAt({ value: 100, cap: 135, at, notify: false }, at + 10 * 3600_000).now).toBe(135);
    expect(sanityAt({ value: 200, cap: 135, at, notify: false }, at + 3600_000).now).toBe(200);
  });
});
