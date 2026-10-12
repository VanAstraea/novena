import { describe, expect, it } from "vitest";
import { bestMatch, Evaluator, movesFrom, rotation, shiftBySlot, type BaseFile, type Room, type Team } from "../../src/lib/base";

const DATA = {
  ops: {}, control: {}, names: {}, morale: {}, dorm: {}, train: {}, workshop: {},
  rooms: {
    Trade: {
      skills: { s_a: { Money: 30 }, s_b: { Money: 20 }, s_c: { Money: 10 }, s_t: { Money: 5 } },
      groups: [{ desc: "pair", conditions: {}, necessary: [[["s_t"], [], { Money: 25 }], [["s_l"], [], { Money: 25 }]], optional: [] }],
    },
  },
} as unknown as BaseFile;

const trade: Room = { facility: "Trade", product: "Money", slots: 2 };
const skills = (extra: Record<string, string[]> = {}) => new Map(Object.entries({ x: ["s_a"], y: ["s_b"], z: ["s_c"], w: [], ...extra }).map(([k, v]) => [k, new Set(v)]));
const ids = (plan: [Room, Team][][]) => plan.map((s) => s.map(([, t]) => t.members));

describe("pinned operators", () => {
  const ev = new Evaluator(DATA, skills(), [trade]);
  const roster = new Set(["x", "y", "z", "w"]);
  it("fills greedily without pins", () => {
    expect(ids(rotation([trade], ev, roster, 2))).toEqual([[["x", "y"]], [["z"]]]);
  });
  it("places a pinned operator first in their room and shift, counting their own value", () => {
    const plan = rotation([trade], ev, roster, 2, { at: { "0.0": ["z"] }, out: [] });
    expect(ids(plan)).toEqual([[["z", "x"]], [["y"]]]);
    expect(plan[0][0][1]).toMatchObject({ efficiency: 40, pinned: ["z"] });
  });
  it("keeps a pinned operator for a later shift, and pins someone with no skill here", () => {
    expect(ids(rotation([trade], ev, roster, 2, { at: { "1.0": ["x"] }, out: [] }))).toEqual([[["y", "z"]], [["x"]]]);
    expect(ids(rotation([trade], ev, roster, 1, { at: { "0.0": ["w"] }, out: [] }))).toEqual([[["w", "x"]]]);
  });
  it("leaves kept-out operators out, and ignores pins for shifts or rooms the plan doesn't have", () => {
    expect(ids(rotation([trade], ev, roster, 1, { at: { "1.0": ["x"], "0.3": ["y"] }, out: ["x"] }))).toEqual([[["y", "z"]]]);
  });
  it("counts a skill combination a pinned operator is part of", () => {
    const ev2 = new Evaluator(DATA, skills({ t: ["s_t"], l: ["s_l"] }), [trade]);
    const plan = rotation([trade], ev2, new Set(["x", "y", "t", "l"]), 1, { at: { "0.0": ["t"] }, out: [] });
    expect(plan[0][0][1]).toMatchObject({ members: ["t", "l"], efficiency: 50, group: "pair", pinned: ["t"] });
  });
});

describe("laying a shift onto your base", () => {
  const formulas = { "1": "2001", "4": "3003" };
  const gold: Room = { facility: "Mfg", product: "PureGold", slots: 3 };
  const records: Room = { facility: "Mfg", product: "CombatRecord", slots: 3 };
  it("puts each factory where that product is already made", () => {
    // your base, in the game's order: factory 1 makes records with b, factory 2 makes gold with c
    const rooms = [
      { slot: "f1", room: "MANUFACTURE", level: 3, formula: "1", team: [{ charId: "b" }] },
      { slot: "f2", room: "MANUFACTURE", level: 3, formula: "4", team: [{ charId: "c" }] },
    ];
    const shift: [Room, Team][] = [[gold, { members: ["a"], efficiency: 30 }], [records, { members: ["b"], efficiency: 30 }]];
    const planned = shiftBySlot(shift, rooms, formulas);
    expect(planned.get("f2")?.[0]).toBe(gold);
    expect(planned.get("f1")?.[0]).toBe(records);
    expect(movesFrom(planned, rooms)).toBe(1); // only a moves in; by game order alone it was 2
  });
  it("then picks the room where the fewest operators move, then the game's order", () => {
    const t1: Room = { facility: "Trade", product: "Money", slots: 2 };
    const rooms = [
      { slot: "t1", room: "TRADING", level: 3, team: [{ charId: "y" }] },
      { slot: "t2", room: "TRADING", level: 3, team: [{ charId: "x" }] },
    ];
    const planned = shiftBySlot([[t1, { members: ["x"], efficiency: 30 }], [t1, { members: ["z"], efficiency: 20 }]], rooms);
    expect(planned.get("t2")?.[1].members).toEqual(["x"]);
    expect(movesFrom(planned, rooms)).toBe(1);
    const even = shiftBySlot([[t1, { members: ["p"], efficiency: 30 }], [t1, { members: ["q"], efficiency: 20 }]], rooms);
    expect(even.get("t1")?.[1].members).toEqual(["p"]); // a tie keeps the game's order
  });
  it("doesn't put a team in a room too small for it", () => {
    const big: Room = { facility: "Trade", product: "Money", slots: 3 };
    const small: Room = { facility: "Trade", product: "Money", slots: 2 };
    const rooms = [
      { slot: "t1", room: "TRADING", level: 3, team: [{ charId: "y" }] },
      { slot: "t2", room: "TRADING", level: 2, team: [{ charId: "x" }] },
    ];
    const planned = shiftBySlot([[big, { members: ["x", "a", "b"], efficiency: 30 }], [small, { members: ["y", "c"], efficiency: 20 }]], rooms);
    expect(planned.get("t1")?.[0]).toBe(big);
  });
  it("matches as many rooms as both sides have", () => {
    expect(bestMatch([[[0, 2]], [[0, 0]]])).toEqual([[1, 0]]);
    expect(bestMatch([[[1], [0], [0]]])).toEqual([[0, 1]]);
    expect(bestMatch([])).toEqual([]);
  });
});
