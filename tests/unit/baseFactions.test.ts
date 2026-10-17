import { describe, expect, it } from "vitest";
import { assign, Evaluator, type BaseFile, type Room } from "../../src/lib/base";
import { factionCounts, trainerSpeed } from "../../src/lib/training";

// Two factories (one Pure Gold, one Battle Records), a Trading Post and a Control Center; ops named by what they do.
const DATA = {
  ops: {}, names: {}, morale: {}, dorm: {}, train: {}, workshop: {},
  control: { c_flat: { Mfg: 2 } },
  factions: {
    c_bs: [{ k: "per", f: "Mfg", t: "blacksteel", v: { all: 5 } }],
    c_pinus: [{ k: "per", f: "Mfg", t: "pinus", v: { CombatRecord: 10, PureGold: -10 } }],
    c_kj: [{ k: "room", f: "Trade", t: "kjerag", n: 3, v: 10 }],
    c_minos: [{ k: "base", f: "Reception", t: "minos", v: 4, max: 8 }],
    c_lgd: [{ k: "with", f: "Mfg", t: "lgd", v: 3 }],
  },
  rooms: {
    Mfg: { skills: { m: { PureGold: 30, CombatRecord: 30 } }, groups: [] },
    Trade: { skills: { t: { Money: 30 } }, groups: [] },
  },
} as unknown as BaseFile;

const gold: Room = { facility: "Mfg", product: "PureGold", slots: 2 };
const records: Room = { facility: "Mfg", product: "CombatRecord", slots: 2 };
const trade: Room = { facility: "Trade", product: "Money", slots: 3 };
const control: Room = { facility: "Control", product: "Boost", slots: 2 };

function plan(ops: Record<string, [string[], string[]]>, rooms: Room[] = [gold, records, trade, control]) {
  const skills = new Map(Object.entries(ops).map(([id, [s]]) => [id, new Set(s)]));
  const factions = new Map(Object.entries(ops).map(([id, [, f]]) => [id, f]));
  return assign(rooms, new Evaluator(DATA, skills, rooms, 20, factions), new Set(Object.keys(ops)));
}
const controlOf = (p: ReturnType<typeof plan>) => p.find(([r]) => r.facility === "Control")![1];

describe("the Control Center's faction effects", () => {
  it("count members of a faction working in factories, per factory product", () => {
    const p = plan({ b1: [["m"], ["blacksteel"]], b2: [["m"], ["blacksteel"]], p1: [["m"], ["pinus"]], boss: [["c_bs"], []], pine: [["c_pinus"], []] });
    const c = controlOf(p);
    expect(c.members).toContain("boss");
    expect(c.factions).toContainEqual({ faction: "blacksteel", facility: "Mfg", value: 10 });
    // the Pinus member landed in a factory; records gain, gold loses
    const pinusRoom = p.find(([, t]) => t.members.includes("p1"))![0];
    if (c.members.includes("pine")) expect(c.factions).toContainEqual({ faction: "pinus", facility: "Mfg", value: pinusRoom.product === "CombatRecord" ? 10 : -10 });
  });

  it("count a Trading Post only when it holds enough of the faction", () => {
    const three = plan({ k1: [["t"], ["kjerag"]], k2: [["t"], ["kjerag"]], k3: [["t"], ["kjerag"]], ceo: [["c_kj"], []] });
    expect(controlOf(three).factions).toEqual([{ faction: "kjerag", facility: "Trade", value: 10 }]);
    const two = plan({ k1: [["t"], ["kjerag"]], k2: [["t"], ["kjerag"]], x: [["t"], []], ceo: [["c_kj"], []] });
    expect(controlOf(two).members).not.toContain("ceo"); // nothing to gain
  });

  it("count members anywhere in the base, up to the cap, without adding production", () => {
    const p = plan({ a: [["m"], ["minos"]], b: [["m"], ["minos"]], c: [["t"], ["minos"]], hero: [["c_minos", "c_flat"], []] });
    const c = controlOf(p);
    expect(c.factions).toEqual([{ faction: "minos", facility: "Reception", value: 8 }]);
    expect(c.efficiency).toBe(2 * 2); // only the flat factory buff, over two factories
  });

  it("pairs an effect that needs a faction member alongside in the Control Center", () => {
    const p = plan({ chief: [["c_lgd"], []], guard: [[], ["lgd"]], other: [[], []] }, [gold, records, control]);
    const c = controlOf(p);
    expect(c.members.sort()).toEqual(["chief", "guard"]);
    expect(c.boosts).toEqual({ Mfg: 3 });
    expect(c.efficiency).toBe(6);
  });

  it("leaves older files without faction effects as they were", () => {
    const old = { ...DATA, factions: undefined } as BaseFile;
    const rooms = [gold, control];
    const skills = new Map([["boss", new Set(["c_bs", "c_flat"])], ["b1", new Set(["m"])]]);
    const p = assign(rooms, new Evaluator(old, skills, rooms, 20, new Map([["b1", ["blacksteel"]]])), new Set(["boss", "b1"]));
    expect(controlOf(p)).toMatchObject({ members: ["boss"], efficiency: 2 });
    expect(controlOf(p).factions).toBeUndefined();
  });
});

describe("trainers that count a faction in the base", () => {
  const data = { train: { plain: [20, [], null, null, 0] }, trainFaction: { sami: ["sami", 10, 3] } } as unknown as BaseFile;
  const factions = new Map([["a", ["sami"]], ["b", ["sami", "rhodes"]], ["c", ["sami"]], ["d", ["sami"]], ["e", ["rhodes"]]]);

  it("count each stationed operator's factions once", () => {
    expect(factionCounts(["a", "b", "b", "e"], factions)).toEqual(new Map([["sami", 2], ["rhodes", 2]]));
  });

  it("add their speed per member, up to the cap, only when told who's stationed", () => {
    const skills = new Set(["sami", "plain"]);
    expect(trainerSpeed(data, skills, "SNIPER", "", 3)).toBe(20);
    expect(trainerSpeed(data, skills, "SNIPER", "", 3, factionCounts(["a", "b"], factions))).toBe(40);
    expect(trainerSpeed(data, skills, "SNIPER", "", 3, factionCounts(["a", "b", "c", "d"], factions))).toBe(50); // 3 at most
  });
});
