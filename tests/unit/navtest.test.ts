import { describe, expect, it } from "vitest";
import { decode, encode, findCodes, places, tally, type Response } from "../../src/lib/navtest";

const sample: Response = {
  version: 1,
  often: "w",
  tasks: [
    { task: 3, first: 2, place: 12, correct: true, clicks: 3, seconds: 18 },
    { task: 1, first: null, place: null, correct: false, clicks: 0, seconds: 4 },
    { task: 8, first: 1, place: 2, correct: false, clicks: 40, seconds: 2000 }, // clicks and seconds stop at their caps
  ],
};

describe("navtest codes", () => {
  it("round-trips, capping what doesn't fit", () => {
    const code = encode(sample);
    expect(code).toBe("NT1-w-3y20c30i-1szzz004-8n102zzz");
    expect(decode(code)).toEqual({
      ...sample,
      tasks: [sample.tasks[0], sample.tasks[1], { ...sample.tasks[2], clicks: 35, seconds: 1295 }],
    });
  });
  it("finds codes inside other text, once each", () => {
    const a = encode(sample);
    const b = encode({ version: 1, often: "x", tasks: [{ task: 2, first: 0, place: 0, correct: true, clicks: 1, seconds: 7 }] });
    const text = `Here's mine: ${a}\n> quoting: ${a}\nand ${b}, thanks! NT1-w-junk`;
    expect(findCodes(text)).toEqual([a, b]);
    expect(decode("NT1-w-3y20c3")).toBeNull();
  });
  it("numbers places depth first, menus left out", () => {
    const ps = places([{ label: "Today" }, { label: "Plan", children: [{ label: "Priorities", children: [{ label: "By archetype" }] }, { label: "Farming" }] }]);
    expect(ps.map((p) => [p.index, p.top, p.path.join(" › ")])).toEqual([
      [0, 0, "Today"], [1, 1, "Plan › Priorities"], [2, 1, "Plan › Priorities › By archetype"], [3, 1, "Plan › Farming"],
    ]);
  });
});

describe("navtest tally", () => {
  const code = (often: Response["often"], ...tasks: Response["tasks"]) => encode({ version: 1, often, tasks });
  const codes = [
    code("d", { task: 1, first: 2, place: 5, correct: true, clicks: 2, seconds: 10 }, { task: 2, first: 0, place: 0, correct: true, clicks: 1, seconds: 4 }),
    code("w", { task: 1, first: 4, place: 9, correct: false, clicks: 5, seconds: 30 }, { task: 2, first: 2, place: 7, correct: false, clicks: 3, seconds: 20 }),
    code("w", { task: 1, first: 2, place: 6, correct: false, clicks: 4, seconds: 20 }, { task: 2, first: null, place: null, correct: false, clicks: 0, seconds: 3 }),
    code("x", { task: 1, first: 4, place: 9, correct: false, clicks: 3, seconds: 40 }),
    encode({ version: 2, often: "r", tasks: [{ task: 1, first: 2, place: 5, correct: true, clicks: 2, seconds: 10 }] }),
  ];
  it("adds up each task", () => {
    const t = tally([...codes, codes[0]], { version: 1, firstRight: { 1: [2], 2: [0, 2] } });
    expect(t.read).toBe(4);
    expect(t.ignored).toBe(1);
    expect(t.often).toEqual({ d: 1, w: 2, r: 0, x: 1 });
    const [t1, t2] = t.tasks;
    expect(t1).toEqual({ task: 1, answers: 4, found: 1, skipped: 0, firstRight: 2, medianSeconds: 25, wrong: [[9, 2], [6, 1]], firsts: [[2, 2], [4, 2]] });
    expect(t2).toEqual({ task: 2, answers: 3, found: 1, skipped: 1, firstRight: 2, medianSeconds: 12, wrong: [[7, 1]], firsts: [[0, 1], [2, 1]] });
  });
  it("leaves the first-click score out when the right items aren't given", () => {
    expect(tally(codes).tasks[0].firstRight).toBeNull();
    expect(tally(codes).read).toBe(5);
  });
});
