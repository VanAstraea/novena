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
    expect(r.ops.char_202_demkni).toEqual({ id: "char_202_demkni", elite: 2, level: 90, pot: 3, skillLevel: 7, masteries: [0, 3], modules: { X: 3 } });
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
});
