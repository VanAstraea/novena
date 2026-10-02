import { describe, expect, it } from "vitest";
import ops from "../golden/ops.json";
import { label, parse, reach } from "../../src/lib/build";
import { fresh } from "../../src/lib/costs";
import { schedule } from "../../src/lib/farming";
import { statsAt } from "../../src/lib/stats";
import { gameDay, nextDailyReset, nextWeeklyReset } from "../../src/lib/time";
import type { OpDetail } from "../../src/types";

const saria = (ops as unknown as Record<string, OpDetail>).char_202_demkni;

describe("build text", () => {
  it("parses the documented format", () => {
    const { name, target } = parse("Saria E2 L90, S2 M3, Mod X2");
    expect(name).toBe("Saria");
    expect(target).toEqual({ elite: 2, level: 90, skillLevel: 0, masteries: { 2: 3 }, modules: { X: 2 } });
    expect(label(target)).toBe("E2 L90, S2 M3, Mod X2");
  });
  it("accepts compact forms", () => {
    expect(parse("e2 sl7 s3m3 modY3").target).toEqual({ elite: 2, level: 0, skillLevel: 7, masteries: { 3: 3 }, modules: { Y: 3 } });
  });
  it("explains a mastery without a skill", () => {
    expect(() => parse("Saria M3")).toThrow(/Which skill/);
  });
  it("pulls in prerequisites", () => {
    const s = reach(saria, 6, "Saria", fresh(saria), parse("S2M3").target);
    expect(s.elite).toBe(2);
    expect(s.skillLevel).toBe(7);
    expect(s.masteries[1]).toBe(3);
  });
  it("refuses what the operator can't do", () => {
    expect(() => reach(saria, 6, "Saria", fresh(saria), parse("Mod D1").target)).toThrow(/can't reach Mod D1/);
  });
});

describe("stats", () => {
  it("matches the game's numbers at E2 90 with full trust", () => {
    const s = statsAt(saria, { elite: 2, level: 90, pot: 1, trust: 100 });
    expect(s.total.hp).toBe(3150);
    expect(s.total.atk).toBe(485 + 50);
    expect(s.total.def).toBe(595 + 60);
    expect(s.total.cost).toBe(22);
  });
  it("applies potentials and modules", () => {
    const s = statsAt(saria, { elite: 2, level: 90, pot: 6, trust: 0, module: { letter: "X", stage: 1 } });
    expect(s.total.cost).toBe(20);
    expect(s.total.def).toBe(595 + 27);
    expect(s.total.atk).toBe(485 + 50);
    expect(s.total.hp).toBe(3150 + 150);
  });
  it("interpolates levels", () => {
    expect(statsAt(saria, { elite: 0, level: 1, pot: 1, trust: 0 }).total.hp).toBe(1309);
    expect(statsAt(saria, { elite: 0, level: 50, pot: 1, trust: 0 }).total.hp).toBe(1769);
  });
});

describe("game days", () => {
  it("Global resets at 04:00 UTC-7 (11:00 UTC)", () => {
    const t = Date.UTC(2026, 9, 2, 10, 59); // Fri 10:59 UTC: still Thursday's game day
    expect(gameDay("en", t).weekday).toBe(4);
    expect(nextDailyReset("en", t)).toBe(Date.UTC(2026, 9, 2, 11, 0));
    expect(gameDay("en", Date.UTC(2026, 9, 2, 11, 0)).weekday).toBe(5);
  });
  it("weekly reset is Monday at the daily reset", () => {
    expect(nextWeeklyReset("en", Date.UTC(2026, 9, 2, 12))).toBe(Date.UTC(2026, 9, 5, 11));
    expect(nextWeeklyReset("cn", Date.UTC(2026, 9, 2, 12))).toBe(Date.UTC(2026, 9, 4, 20));
  });
});

describe("schedule", () => {
  it("puts weekday stages on their days first", () => {
    const { days, last } = schedule(
      [{ code: "PR-A-2", runs: 3, sanity: 36 }, { code: "1-7", runs: 10, sanity: 6 }],
      { "PR-A-2": [1, 4], "1-7": null }, 2, 100, 180,
    );
    expect(days[0].runs).toEqual([{ code: "1-7", runs: 10, sanity: 60 }]);
    expect(days[2].weekday).toBe(4);
    expect(days[2].runs[0].code).toBe("PR-A-2");
    expect(last).toBe(2);
  });
});
