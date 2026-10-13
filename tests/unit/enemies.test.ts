import { describe, expect, it } from "vitest";
import { damageText, filterEnemies, immunities, readFilters, stageHits, stageSuggestions, statText, varies, whereItAppears } from "../../src/lib/enemies";
import type { EnemyRow, EnemyStagesFile, EnemyStats } from "../../src/types";

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

describe("Where an enemy appears", () => {
  const file: EnemyStagesFile = {
    groups: ["Episode 1", "Darknights Memoir"],
    stages: [["1-7", "The Tyrant", 0], ["1-8", "Ambush", 0], ["DM-1", "Buried", 1], ["DM-1", "Buried", 1]],
    by: { enemy_1007_slime: [[0, 0], [2, 1], [3, 1], [1, 0]], enemy_x: [[9, 0]] },
  };

  it("groups its stages by chapter or event, each stage once, with the level used", () => {
    expect(whereItAppears(file, "enemy_1007_slime")).toEqual([
      { name: "Episode 1", stages: [{ code: "1-7", name: "The Tyrant", lv: 0 }, { code: "1-8", name: "Ambush", lv: 0 }] },
      { name: "Darknights Memoir", stages: [{ code: "DM-1", name: "Buried", lv: 1 }] },
    ]);
  });

  it("is empty for an enemy in no listed stage", () => {
    expect(whereItAppears(file, "enemy_nobody")).toEqual([]);
    expect(whereItAppears(file, "enemy_x")).toEqual([]);
  });
});

describe("Finding a stage's enemies", () => {
  const file: EnemyStagesFile = {
    groups: ["Episode 1", "Trials for Navigator", "Supplies: Cargo Escort"],
    stages: [["1-7", "The Tyrant", 0], ["TN-2", "Round 1", 1], ["TN-2", "Round 2", 1], ["CE-5", "", 2], ["15", "Odd", 0], ["TN-2", "Round 2", 1]],
    by: { enemy_b: [[0, 1]], enemy_a: [[0, 0], [1, 0], [2, 1], [0, 1], [5, 2]], enemy_c: [[3, 2], [5, 0]] },
  };

  it("reads the code without case, spaces or dash style", () => {
    for (const typed of ["1-7", " 1 - 7 ", "1–7"]) expect(stageHits(file, typed).map((h) => h.code)).toEqual(["1-7"]);
    expect(stageHits(file, "ce5")[0].code).toBe("CE-5");
  });

  it("lists every stage with a repeated code, each with its enemies and the levels used", () => {
    const hits = stageHits(file, "tn-2");
    expect(hits.map((h) => [h.name, h.group, [...h.enemies]])).toEqual([
      ["Round 1", "Trials for Navigator", [["enemy_a", [0]]]],
      ["Round 2", "Trials for Navigator", [["enemy_a", [1, 2]], ["enemy_c", [0]]]], // its two copies, as one
    ]);
    expect([...stageHits(file, "1-7")[0].enemies]).toEqual([["enemy_b", [1]], ["enemy_a", [0, 1]]]);
  });

  it("prefers an exact code over one without its dash", () => {
    expect(stageHits(file, "15").map((h) => h.name)).toEqual(["Odd"]);
    expect(stageHits(file, "nope")).toEqual([]);
  });

  it("suggests codes that start with what's typed", () => {
    expect(stageSuggestions(file, "tn")).toEqual(["TN-2"]);
    expect(stageSuggestions(file, "")).toEqual([]);
  });

  it("filters the list to a stage's enemies, in the stage's order, sorting by the level it uses", () => {
    const a = enemy("enemy_a", { lv: [stats({ hp: 100 }), stats({ hp: 5000 })] });
    const b = enemy("enemy_b", { lv: [stats({ hp: 900 }), stats({ hp: 1000 })] });
    const only = new Map([["enemy_b", [1]], ["enemy_a", [1]]]);
    const f = readFilters(new URLSearchParams());
    expect(filterEnemies([a, b, enemy("enemy_z")], f, only).map((e) => e.id)).toEqual(["enemy_b", "enemy_a"]);
    expect(filterEnemies([a, b], readFilters(new URLSearchParams("sort=hp")), only).map((e) => e.id)).toEqual(["enemy_a", "enemy_b"]);
  });
});
