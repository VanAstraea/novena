import { describe, expect, it } from "vitest";
import { placePopover, plain, stageChanges, stageSummary, statText } from "../../src/lib/modules";
import type { Module } from "../../src/types";

const trait = "Attacks <b>all enemies</b> within range";
const mod: Module = {
  id: "uniequip_003_x", name: "Holiday", letter: "Y", icon: "RPR-Y", type: "rpr-y", img: "", unlock: { elite: 2, level: 60 }, cost: [],
  stages: [
    { attrs: { cost: -8, hp: 135, atk: 55 }, trait: [trait], talents: [] },
    { attrs: { cost: -8, hp: 165, atk: 80 }, trait: [trait], talents: [{ name: "Vacation", desc: "ATK +10%" }] },
    { attrs: { cost: -8, hp: 180, atk: 100 }, trait: [trait], talents: [{ name: "Vacation", desc: "ATK +15%" }] },
  ],
};

describe("module stages", () => {
  it("writes stats in the game's order with friendly names", () => {
    expect(statText({ cost: -8, hp: 135, atk: 55 })).toBe("HP +135, ATK +55, DP cost −8");
    expect(statText({ respawn: -10, aspd: 8, def: 0 })).toBe("Redeploy −10 s, ASPD +8");
    expect(statText({})).toBe("");
  });
  it("keeps the trait only where it changes", () => {
    const c = stageChanges(mod);
    expect(c.map((s) => s.trait.length)).toEqual([1, 0, 0]);
    expect(c.map((s) => s.talents.map((t) => t.desc))).toEqual([[], ["ATK +10%"], ["ATK +15%"]]);
    expect(c[2].stats).toBe("HP +180, ATK +100, DP cost −8");
  });
  it("sums a stage up in one line", () => {
    expect(stageSummary(mod, 1)).toBe("Stage 1: HP +135, ATK +55, DP cost −8 · trait: Attacks all enemies within range");
    expect(stageSummary(mod, 3)).toBe("Stage 3: HP +180, ATK +100, DP cost −8 · improves Vacation");
    expect(stageSummary(mod, 4)).toBe("");
    expect(plain("<b>1 &amp; 2</b>")).toBe("1 & 2");
  });
});

describe("popover placement", () => {
  const view = { w: 375, h: 700 };
  it("goes below the icon when it fits, centred on it", () => {
    const p = placePopover({ top: 100, bottom: 130, left: 170, right: 200 }, { w: 300, h: 200 }, view);
    expect(p).toEqual({ top: 136, left: 35, above: false, maxH: 556 });
  });
  it("flips above when there's more room there", () => {
    const p = placePopover({ top: 600, bottom: 630, left: 10, right: 40 }, { w: 300, h: 200 }, view);
    expect(p.above).toBe(true);
    expect(p.top).toBe(394);
    expect(p.left).toBe(8); // kept inside the left edge
  });
  it("stays inside the right edge and caps its height", () => {
    const p = placePopover({ top: 300, bottom: 330, left: 340, right: 370 }, { w: 300, h: 900 }, view);
    expect(p.left).toBe(375 - 300 - 8);
    expect(p.above).toBe(false);
    expect(p.maxH).toBe(700 - 330 - 6 - 8);
  });
});
