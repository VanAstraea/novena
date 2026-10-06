import { describe, expect, it } from "vitest";
import { pageScore, PAGES, SECTIONS } from "../../src/pages/registry";

const top = (q: string) => [...PAGES].sort((a, b) => pageScore(q, b) - pageScore(q, a))[0].path;

describe("site sections", () => {
  it("has five sections of at most five pages, each opening on one of its own", () => {
    expect(SECTIONS).toHaveLength(5);
    for (const s of SECTIONS) {
      const pages = PAGES.filter((p) => p.group === s.id && p.nav);
      expect(pages.length, s.label).toBeGreaterThan(0);
      expect(pages.length, s.label).toBeLessThanOrEqual(5);
      expect(pages.map((p) => p.path), s.label).toContain(s.home);
    }
  });
  it("puts every page with a strip label in a section", () => {
    for (const p of PAGES.filter((x) => x.nav)) expect(SECTIONS.map((s) => s.id), p.path).toContain(p.group);
  });
});

describe("page search", () => {
  it.each([
    ["materials", "/planner"], ["upgrade planner", "/planner"],
    ["banners & pulls", "/pulls"], ["pull planner", "/pulls"],
    ["story & archives", "/story"], ["story & events", "/story"],
    ["roster gaps", "/gaps"], ["gaps", "/gaps"],
    ["sanity dump", "/dump"], ["database", "/operators"], ["import guide", "/guide"], ["what you play", "/settings"],
  ])("finds %s", (q, path) => expect(top(q)).toBe(path));
});
