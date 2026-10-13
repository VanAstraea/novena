import { beforeEach, describe, expect, it, vi } from "vitest";

// A small stand-in for the browser's local storage (the tests run in Node, without IndexedDB: storage falls back to it).
class Mem {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

let ls: Mem;
beforeEach(() => {
  vi.resetModules();
  ls = new Mem();
  vi.stubGlobal("localStorage", ls);
});

const load = () => import("../../src/lib/backup");

describe("The backup", () => {
  it("carries tier lists and other choices exactly as saved, but not the Novena Sync pairing key", async () => {
    const tiers = JSON.stringify({ lists: [{ id: "a", title: "Mine", tiers: [] }], current: "a" });
    ls.setItem("novena.account.en", JSON.stringify({ ops: { char_002_amiya: {} } }));
    ls.setItem("novena.tierlists", tiers);
    ls.setItem("novena.baseView", "map"); // plain text, not JSON
    ls.setItem("novena.prioFilters", '{"skip":["char_002_amiya"]}');
    ls.setItem("novena.syncKey", "secret-pairing-key");
    const b = await (await load()).makeBackup();
    expect(b.version).toBe(2);
    expect(b.data).toEqual({ "account.en": { ops: { char_002_amiya: {} } } });
    expect(b.raw).toEqual({ tierlists: tiers, baseView: "map", prioFilters: '{"skip":["char_002_amiya"]}' });
    expect(JSON.stringify(b)).not.toContain("secret-pairing-key");
  });

  it("restores them, and leaves this computer's pairing key alone", async () => {
    ls.setItem("novena.syncKey", "mine");
    const n = await (await load()).restoreBackup({
      app: "novena", version: 2, exported: "", data: { "targets.jp": [{ op: "x" }] },
      raw: { tierlists: '{"lists":[],"current":""}', baseView: "list", syncKey: "theirs", "bad key!": "x" },
    });
    expect(n).toBe(3);
    expect(ls.getItem("novena.targets.jp")).toBe('[{"op":"x"}]');
    expect(ls.getItem("novena.tierlists")).toBe('{"lists":[],"current":""}');
    expect(ls.getItem("novena.baseView")).toBe("list");
    expect(ls.getItem("novena.syncKey")).toBe("mine");
    expect(ls.getItem("novena.bad key!")).toBeNull();
  });

  it("restores tier lists from older (version 1) backups too", async () => {
    await (await load()).restoreBackup({ app: "novena", version: 1, exported: "", data: { "account.en": { ops: {} }, tierlists: { lists: [], current: "" }, baseGold: 3, "priorities.en": { key: "k" } } });
    expect(JSON.parse(ls.getItem("novena.tierlists")!)).toEqual({ lists: [], current: "" });
    expect(ls.getItem("novena.baseGold")).toBe("3");
    expect(ls.getItem("novena.priorities.en")).toBeNull();
  });

  it("refuses other files", async () => {
    await expect((await load()).restoreBackup({ data: {} })).rejects.toThrow("isn't a Novena backup");
    await expect((await load()).restoreBackup(null)).rejects.toThrow();
  });
});
