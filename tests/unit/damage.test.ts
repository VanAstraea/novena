import { describe, expect, it } from "vitest";
import { damageAt, damageType, hitDamage } from "../../src/lib/damage";
import type { OpDetail } from "../../src/types";

const phase = { max: 90, range: "x", lo: { hp: 1000, atk: 500, def: 100, res: 0, interval: 1.0, aspd: 100 }, hi: { hp: 1000, atk: 500, def: 100, res: 0, interval: 1.0, aspd: 100 } };
const op = (desc: string, levels: object[] = []) => ({
  id: "x", desc, trait: null, phases: [phase, phase, phase], trust: {}, pots: [], talents: [], modules: [],
  skills: [{ id: "s", name: "S", sp: "auto", type: "manual", ammo: false, levels }],
}) as unknown as OpDetail;

describe("the damage estimate", () => {
  it("reads the damage type from the trait", () => {
    expect(damageType(op("Deals <@ba.kw>Arts damage</>"), 2)).toBe("arts");
    expect(damageType(op("Blocks 3 enemies"), 2)).toBe("physical");
    expect(damageType(op("Restores the HP of allied units"), 2)).toBe("none");
    expect(damageType(op("Does not attack but restores HP"), 2)).toBe("none");
    const withOverride = { ...op("Blocks 1 enemy"), trait: [{ elite: 2, pot: 0, desc: "Attacks deal Arts damage" }] } as OpDetail;
    expect([damageType(withOverride, 1), damageType(withOverride, 2)]).toEqual(["physical", "arts"]);
  });

  it("takes DEF off physical hits and RES off Arts hits, never below 5% of ATK", () => {
    expect(hitDamage(1000, "physical", { def: 300, res: 50 })).toBe(700);
    expect(hitDamage(1000, "physical", { def: 990, res: 0 })).toBe(50);
    expect(hitDamage(1000, "arts", { def: 900, res: 30 })).toBeCloseTo(700);
    expect(hitDamage(1000, "arts", { def: 0, res: 100 })).toBe(50);
    expect(hitDamage(1000, "true", { def: 900, res: 90 })).toBe(1000);
  });

  it("works out normal attacks and a plain skill, and declines the rest", () => {
    const d = op("Blocks 2 enemies", [{ desc: "", sp: 30, init: 0, dur: 20, bb: { atk: 1, attack_speed: 100, atk_scale: 1.5 } }]);
    const est = damageAt(d, { elite: 2, level: 90, pot: 1, trust: 0, skill: 0, skillLevel: 1 }, { def: 200, res: 0 });
    expect(est.normal).toEqual({ hit: 300, dps: 300, interval: 1 });
    expect(est.skill).toEqual({ hit: 1300, dps: 2600, interval: 0.5 }); // 500 × 2 × 1.5 − 200, twice as often
    const odd = op("Blocks 2 enemies", [{ desc: "", sp: 30, init: 0, dur: 20, x: 1 }]);
    expect(damageAt(odd, { elite: 2, level: 90, pot: 1, trust: 0, skill: 0 }, { def: 0, res: 0 }).skill).toHaveProperty("why");
    const instant = op("Blocks 2 enemies", [{ desc: "", sp: 5, init: 0, dur: 0, bb: { atk_scale: 3 } }]);
    expect(damageAt(instant, { elite: 2, level: 90, pot: 1, trust: 0, skill: 0 }, { def: 0, res: 0 }).skill).toHaveProperty("why");
    const healer = op("Restores the HP of allies");
    expect(damageAt(healer, { elite: 2, level: 90, pot: 1, trust: 0 }, { def: 0, res: 0 })).toEqual({ type: "none", normal: null, skill: null });
  });
});
