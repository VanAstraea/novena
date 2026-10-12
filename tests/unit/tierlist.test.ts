import { describe, expect, it } from "vitest";
import { blankList, decodeShare, encodeShare, fromFile, fromUsage, moveOp, nextTier, pack, toFile, unpack, type TierList } from "../../src/lib/tierlist";

// ids shaped like the game's: char_<number>_<name>, with one that has no number
const IDS = Array.from({ length: 400 }, (_, i) => `char_${100 + i * 9}_op${i}`).concat("char_1028_texas2", "token_odd");

function sixty(): TierList {
  const list = blankList("Annihilation picks, one per class and then some");
  IDS.slice(0, 60).forEach((id, i) => { list.tiers[i % 5].ops.push(id); });
  list.tiers[0].note = "Carry anything";
  list.tiers[2].name = "Good — situational";
  list.tiers[4].color = "r1";
  return list;
}

const same = (a: TierList, b: TierList) => {
  expect(b.title).toBe(a.title);
  expect(b.roster).toBe(a.roster);
  expect(b.tiers).toEqual(a.tiers);
};

describe("tier list share links", () => {
  it("round-trips through the packed text", () => {
    const list = sixty();
    list.roster = true;
    list.tiers[1].ops.push("token_odd", "char_1028_texas2");
    const { list: back, missing } = unpack(pack(list, IDS), IDS);
    expect(missing).toBe(0);
    same(list, back);
  });

  it("round-trips compressed and plain", async () => {
    const list = sixty();
    for (const compress of [true, false]) {
      const code = await encodeShare(list, IDS, compress);
      expect(code.startsWith(compress ? "d." : "p.")).toBe(true);
      expect(code).toMatch(/^[dp]\.[A-Za-z0-9_-]+$/); // safe in a URL hash as is
      const { list: back } = await decodeShare(code, IDS);
      same(list, back);
    }
  });

  it("keeps names in any script", async () => {
    const list = blankList("干员 tier list ✦");
    list.tiers[0].name = "神";
    list.tiers[0].ops = [IDS[3]];
    same(list, (await decodeShare(await encodeShare(list, IDS), IDS)).list);
  });

  it("makes a short link for a 60-operator list", async () => {
    const code = await encodeShare(sixty(), IDS);
    const url = `https://example.github.io/novena/tiers#t=${code}`;
    expect(code.length).toBeLessThan(400);
    expect(url.length).toBeLessThan(450);
    expect((await encodeShare(sixty(), IDS, false)).length).toBeLessThan(600);
  });

  it("leaves out operators it doesn't know and refuses junk", async () => {
    const list = blankList();
    list.tiers[0].ops = [IDS[0], "char_9999_nobody"];
    const { list: back, missing } = await decodeShare(await encodeShare(list, IDS), IDS);
    expect(back.tiers[0].ops).toEqual([IDS[0]]);
    expect(missing).toBe(1);
    await expect(decodeShare("x.abc", IDS)).rejects.toThrow();
    await expect(decodeShare("p.bm90IGpzb24", IDS)).rejects.toThrow();
  });
});

describe("tier list editing", () => {
  it("moves operators between tiers and back", () => {
    let list = blankList();
    list = moveOp(list, "a", 0);
    list = moveOp(list, "b", 0);
    list = moveOp(list, "c", 0, 1);
    expect(list.tiers[0].ops).toEqual(["a", "c", "b"]);
    list = moveOp(list, "a", 2);
    expect(list.tiers[0].ops).toEqual(["c", "b"]);
    expect(list.tiers[2].ops).toEqual(["a"]);
    list = moveOp(list, "a", -1);
    expect(list.tiers.flatMap((t) => t.ops)).toEqual(["c", "b"]);
  });

  it("fills tiers from usage, most used first", () => {
    const scores: [string, number][] = Array.from({ length: 100 }, (_, i) => [`op${i}`, 100 - i]);
    scores.push(["unused", 0]);
    const tiers = fromUsage(scores);
    expect(tiers.map((t) => t.ops.length)).toEqual([5, 10, 20, 25, 40]);
    expect(tiers[0].ops[0]).toBe("op0");
    expect(tiers.flatMap((t) => t.ops)).not.toContain("unused");
  });

  it("names the next tier", () => {
    expect(nextTier(blankList().tiers).name).toBe("E");
  });

  it("round-trips the export file", () => {
    const list = sixty();
    const { list: back, missing } = fromFile(JSON.parse(JSON.stringify(toFile(list))), IDS);
    expect(missing).toBe(0);
    same(list, back);
    expect(() => fromFile({ kind: "other" }, IDS)).toThrow(/tier list file/);
  });
});
