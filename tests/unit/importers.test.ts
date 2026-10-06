import { describe, expect, it } from "vitest";
import fixture from "../fixtures/novena-sync.json";
import { parseRoster } from "../../src/lib/importers";
import type { OpIndex } from "../../src/types";

const op = (id: string, rarity: number, mods: string[] = [], modIds: string[] = []) =>
  ({ id, name: id, rarity, cls: "SNIPER", branch: "", pos: "RANGED", tags: [], factions: [], obtain: "", recruit: false, on: ["en"], mods, modIds }) as unknown as OpIndex;

const OPS = [
  op("char_202_demkni", 6, ["X"], ["uniequip_002_demkni"]),
  op("char_002_amiya", 5, ["Y"], ["uniequip_002_amiya"]),
  op("char_1001_amiya2", 5, ["X"], ["uniequip_002_amiya2"]),
];

describe("Novena Sync files", () => {
  // tests/fixtures/novena-sync.json is made by the companion's own minimize() (sync/tests/test_payload.py checks it).
  const r = parseRoster(fixture, OPS);

  it("are recognised and carry their server", () => {
    expect(r.format).toBe("Novena Sync");
    expect(r.server).toBe("en");
  });

  it("bring operators with masteries and unlocked modules", () => {
    expect(r.ops.char_202_demkni).toEqual({ id: "char_202_demkni", elite: 2, level: 90, pot: 3, skillLevel: 7, masteries: [0, 3], modules: { X: 3 }, skin: "char_202_demkni@test#1" });
  });

  it("bring each of an operator's forms, without locked modules", () => {
    expect(r.ops.char_002_amiya.masteries).toEqual([2]);
    expect(r.ops.char_1001_amiya2.masteries).toEqual([1]);
    expect(r.ops.char_1001_amiya2.modules).toEqual({});
  });

  it("bring the depot, LMD and savings", () => {
    expect(r.depot).toEqual({ "30073": 12, mod_unlock_token: 3, "4001": 1_200_000 });
    expect(r.savings).toEqual({ orundum: 6300, prime: 42, permits: 15, card: true });
  });

  it("bring recruitment slots, the base and sanity (version 2)", () => {
    expect(r.recruit).toEqual([
      { slot: 0, state: 2, tags: [11, 14, 2, 10, 23], picked: [11], start: 1_800_000_000, finish: 1_800_032_400 },
      { slot: 1, state: 1, tags: [1, 4, 9, 12, 17], picked: [], start: -1, finish: -1 },
    ]);
    const factory = r.base!.rooms.find((x) => x.room === "MANUFACTURE")!;
    expect(factory).toMatchObject({ level: 3, formula: "4", made: 7, capacity: 54, done: 1_800_010_000, team: [{ charId: "char_202_demkni", morale: 12 }] });
    expect(r.base!.drones).toEqual({ value: 120, max: 200, ts: 1_800_000_000, speed: 1.1 });
    expect(r.sanity).toEqual({ value: 80, cap: 135, at: 1_800_000_000_000 });
  });

  it("read recruitment slots from the game's own sync data too", () => {
    const raw = { user: { troop: { chars: {} }, recruit: { normal: { slots: { "2": { state: 1, tags: [1, 2], selectTags: [{ tagId: 2, pick: 1 }], startTs: -1, maxFinishTs: -1 } } } } } };
    expect(parseRoster(raw, OPS).recruit).toEqual([{ slot: 2, state: 1, tags: [1, 2], picked: [2], start: -1, finish: -1 }]);
  });
});

describe("Krooster profiles", () => {
  // The shape krooster.com/api/u/<username> returns (neeia/ak-roster, src/pages/api/u/[user].tsx).
  const profile = { data: { account: { username: "doc" }, supports: [], roster: {
    char_202_demkni: { op_id: "char_202_demkni", elite: 2, level: 80, potential: 2, skill_level: 7, masteries: [0, 3, 0], modules: { uniequip_002_demkni: 2 }, favorite: true, skin: "char_202_demkni_epoque#1" },
    char_002_amiya: { op_id: "char_002_amiya", elite: 1, level: 50, potential: 6, skill_level: 4, masteries: [], modules: { uniequip_002_amiya: 0 }, favorite: false, skin: null },
    char_9999_nobody: { op_id: "char_9999_nobody", elite: 0, level: 1, potential: 1, skill_level: 1, masteries: [], modules: {}, favorite: false, skin: null },
  } } };

  it("are read, with module ids turned into letters and unknown operators skipped", () => {
    const r = parseRoster(profile, OPS);
    expect(r.format).toBe("Krooster profile");
    expect(r.skipped).toBe(1);
    expect(r.ops.char_202_demkni).toEqual({ id: "char_202_demkni", elite: 2, level: 80, pot: 2, skillLevel: 7, masteries: [0, 3, 0], modules: { X: 2 } });
    expect(r.ops.char_002_amiya).toEqual({ id: "char_002_amiya", elite: 1, level: 50, pot: 6, skillLevel: 4, masteries: [], modules: {} });
  });

  it("are read when only the roster is pasted", () => {
    expect(Object.keys(parseRoster(profile.data.roster, OPS).ops)).toEqual(["char_202_demkni", "char_002_amiya"]);
  });
});
