import { describe, expect, it } from "vitest";
import { annihilationLeft, archiveLeft, crystalsNow, opLeft, tally, trialStars, unlockNext, weekFee } from "../../src/lib/storyLeft";
import type { RosterOp, StoryProgress } from "../../src/state";
import type { ProgressFile, Retro } from "../../src/types";
import { nextWeeklyReset } from "../../src/lib/time";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const retro = (id: string, extra: Partial<Retro> = {}): Retro => ({
  id, kind: "side", index: 1, name: id, start: "2022-01-01T00:00:00Z", acts: [], op: 3, stars: 7, char: `char_${id}`,
  stages: [[`${id}_01`, "X-1", 17], [`${id}_02`, "X-2", 17], [`${id}_02#f#`, "X-2", 19], [`${id}_st01`, "X-ST-1", 4]],
  trail: { start: "2022-06-01T00:00:00Z", rewards: [["r1", 3, "CHAR", `char_${id}`], ["r2", 6, "VOUCHER_FULL_POTENTIAL", `voucher_${id}`], ["r3", 7, "FURN", "f"]] },
  ...extra,
});
const DATA: ProgressFile = {
  zones: [{ id: "main_0", kind: "main", name: "Prologue", title: null, op: 2, stages: [["main_00-01", "0-1", 1], ["main_00-01#f#", "0-1", 3], ["main_00-02", "0-2", 4]] }],
  retros: [retro("a"), retro("b"), retro("c"), retro("d", { start: "2030-01-01T00:00:00Z" })],
  welfare: {},
  annihilation: [{ id: "camp_r_01", name: "Outskirts", region: "", orundum: 1500, ladders: [[100, 0], [200, 500], [400, 1000]], rotation: null }],
  crystal: { cap: { 0: 2, 60: 3 }, perWeek: 3, unlockCost: 1 },
};
const P: StoryProgress = {
  stages: { "main_00-01": 3, a_01: 3, a_02: 2, "a_02#f#": 2, b_01: 3 }, coin: 1, open: ["a"], claimed: { a: ["r1"] },
  fee: [1200, 1800], feeTs: NOW / 1000 - 3600, annihilation: { camp_r_01: { kills: 250, rewards: [1, 1, 0] } }, level: 70, at: NOW - 3600_000,
};
const op = (id: string, pot: number) => ({ id, elite: 0, level: 1, pot, skillLevel: 1, masteries: [], modules: {} }) as RosterOp;

describe("what's left for you", () => {
  it("counts cleared stages, 3★ and Originite Prime still to claim", () => {
    expect(tally(DATA.zones[0].stages, P)).toEqual({ combat: 1, cleared: 1, three: 1, opLeft: 1 }); // the challenge mode's
  });

  it("counts trial stars: 3 per counting stage at 3★, 1 per challenge mode cleared", () => {
    expect(trialStars(DATA.retros[0], P)).toBe(4);
    const a = archiveLeft(DATA.retros[0], P, NOW);
    expect(a.open).toBe(true);
    expect(a.claimable.map(([id]) => id)).toEqual([]); // r1 claimed, r2 needs 6★
    const b = archiveLeft(DATA.retros[1], P, NOW);
    expect(b.open).toBe(false);
    expect(b.reached.map(([id]) => id)).toEqual(["r1"]);
    expect(b.claimable).toEqual([]); // locked: unlock it first
    expect(archiveLeft(DATA.retros[0], { ...P, claimed: {} }, NOW).claimable.map(([id]) => id)).toEqual(["r1"]);
  });

  it("splits Originite Prime between what you can play and locked archives", () => {
    // main 1 (the challenge mode); a: a_02 and a_02#f# not at 3★; b: 2 left; c: 3 left; d hasn't arrived
    expect(opLeft(DATA, P, NOW)).toEqual({ main: 1, supply: 0, archives: 2, locked: 5, open: 3 });
  });

  it("counts Annihilation milestones not reached", () => {
    expect(annihilationLeft(DATA.annihilation[0], P)).toBe(1000);
    expect(annihilationLeft(DATA.annihilation[0], { ...P, annihilation: {} })).toBe(1500);
    expect(annihilationLeft({ ...DATA.annihilation[0], ladders: undefined }, P)).toBe(1500);
    expect(annihilationLeft(DATA.annihilation[0], { ...P, annihilation: undefined })).toBeNull();
  });

  it("knows this week's Annihilation orundum, and that a new week starts from none", () => {
    expect(weekFee(P, "en", NOW)).toEqual({ got: 1200, cap: 1800, left: 600 });
    const lastWeek = (nextWeeklyReset("en", NOW) - 8 * 86400_000) / 1000;
    expect(weekFee({ ...P, feeTs: lastWeek }, "en", NOW)).toEqual({ got: 0, cap: 1800, left: 1800 });
  });

  it("tops Event Crystals up after a weekly reset", () => {
    expect(crystalsNow(P, DATA, "en", NOW)).toBe(1);
    expect(crystalsNow({ ...P, at: NOW - 9 * 86400_000 }, DATA, "en", NOW)).toBe(3);
  });

  it("ranks locked archives: a missing operator, then full potential, then Originite Prime", () => {
    const picks = unlockNext(DATA, P, { char_b: op("char_b", 3) }, NOW);
    expect(picks.map((x) => [x.r.id, x.why])).toEqual([["c", "missing"], ["b", "potential"]]);
    expect(unlockNext(DATA, P, { char_b: op("char_b", 6), char_c: op("char_c", 6) }, NOW).map((x) => [x.r.id, x.why])).toEqual([["c", "prime"], ["b", "prime"]]);
  });
});
