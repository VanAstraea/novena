import { describe, expect, it } from "vitest";
import { Evaluator, type BaseFile } from "../../src/lib/base";

describe("skills that grow with dorm levels", () => {
  const data = { rooms: { Mfg: { skills: { gold: { PureGold: "0 + 1 * [DormLevels]" } }, groups: [] } }, ops: {}, control: {} } as unknown as BaseFile;
  const skills = new Map([["char_4138_narant", new Set(["gold"])]]);
  const rooms = [{ facility: "Mfg" as const, product: "PureGold", slots: 3 }];

  it("use the base's real dorm levels (20 when not given)", () => {
    expect(new Evaluator(data, skills, rooms).single("Mfg", "char_4138_narant", "PureGold")).toBe(20);
    expect(new Evaluator(data, skills, rooms, 12).single("Mfg", "char_4138_narant", "PureGold")).toBe(12);
  });
});
