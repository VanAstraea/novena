import { describe, expect, it } from "vitest";
import { damageText, filterEnemies, immunities, readFilters, statText, varies } from "../../src/lib/enemies";
import type { EnemyRow, EnemyStats } from "../../src/types";

const stats = (o: Partial<EnemyStats> = {}): EnemyStats => ({ hp: 1000, atk: 100, def: 0, res: 0, wt: 1, spd: 1, rng: 0, int: 1.7, lp: 1, imm: [], ...o });
const enemy = (id: string, o: Partial<EnemyRow> = {}): EnemyRow => ({ id, name: id, code: id.toUpperCase(), level: "NORMAL", dmg: ["physical"], atk: "melee", motion: "walk", lv: [stats()], ...o });

const LIST = [
  enemy("slug", { lv: [stats({ hp: 550 })] }),
  enemy("caster", { dmg: ["arts"], atk: "ranged", lv: [stats({ hp: 2400, res: 50 }), stats({ hp: 6500, res: 50, imm: ["stun"] })] }),
  enemy("boss", { name: "Big Boss", level: "BOSS", dmg: ["physical", "arts"], atk: "both", lv: [stats({ hp: 30000, wt: 6, imm: ["stun", "silence"] })] }),
  enemy("drone", { dmg: [], atk: "none", motion: "fly", lv: [stats({ hp: 1800 })] }),
];
const ids = (q: string) => filterEnemies(LIST, readFilters(new URLSearchParams(q))).map((e) => e.id);

describe("enemy stats as text", () => {
  it("formats each stat for reading", () => {
    expect(statText("hp", 30000)).toBe("30,000");
    expect(statText("int", 1.7)).toBe("1.7 s");
    expect(statText("int", 0)).toBe("–");
    expect(statText("rng", 0)).toBe("–");
    expect(statText("rng", 2.35)).toBe("2.35");
    expect(statText("erst", undefined)).toBe("–");
    expect(statText("wt", 6)).toBe("6");
  });
  it("names damage types, or none", () => {
    expect(damageText(["physical", "arts"])).toBe("Physical and Arts");
    expect(damageText([])).toBe("None");
  });
  it("finds immunities at any level and stats that change between levels", () => {
    expect(immunities(LIST[1])).toEqual(["stun"]);
    expect(varies(LIST[1], "hp")).toBe(true);
    expect(varies(LIST[1], "res")).toBe(false);
    expect(varies(LIST[1], "imm")).toBe(true);
  });
});

describe("enemy list filters", () => {
  it("keeps handbook order with no filters", () => expect(ids("")).toEqual(["slug", "caster", "boss", "drone"]));
  it("filters by level, damage, attack, movement and immunities", () => {
    expect(ids("level=BOSS")).toEqual(["boss"]);
    expect(ids("dmg=arts")).toEqual(["caster", "boss"]);
    expect(ids("dmg=none")).toEqual(["drone"]);
    expect(ids("atk=ranged")).toEqual(["caster", "boss"]); // "both" counts as melee and as ranged
    expect(ids("motion=fly")).toEqual(["drone"]);
    expect(ids("imm=stun")).toEqual(["caster", "boss"]);
    expect(ids("imm=stun,silence")).toEqual(["boss"]);
  });
  it("sorts by a stat at the first level, highest first unless asked", () => {
    expect(ids("sort=hp")).toEqual(["boss", "caster", "drone", "slug"]);
    expect(ids("sort=hp&dir=asc")).toEqual(["slug", "drone", "caster", "boss"]);
    expect(ids("sort=nonsense")).toEqual(["slug", "caster", "boss", "drone"]);
  });
  it("searches by name or code", () => {
    expect(ids("q=big")).toEqual(["boss"]);
    expect(ids("q=SLUG")).toEqual(["slug"]);
  });
});
