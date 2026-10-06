// Operator roles: the mapping's picks, and (with a built data folder) that every branch the game has is listed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRANCH_ROLES, parseRole, ROLE_NAMES, ROLE_OVERRIDES, ROLES, roleOf } from "../../src/lib/roles";
import { CLASS_ORDER } from "../../src/lib/format";
import type { OpIndex } from "../../src/types";

const DATA = resolve(__dirname, "../../public/data/v1");
const SERVERS = ["en", "jp", "kr", "cn"].filter((s) => existsSync(resolve(DATA, s, "operators.json")));
const op = (id: string, cls: string, branch: string) => ({ id, cls, branch });

describe("roles", () => {
  it("names every role and maps branches only to roles", () => {
    expect(Object.keys(ROLE_NAMES)).toEqual([...ROLES]);
    for (const r of [...Object.values(BRANCH_ROLES), ...Object.values(ROLE_OVERRIDES)]) expect(ROLES).toContain(r);
  });
  it("reads the job from the branch, then the class", () => {
    expect(roleOf(op("char_202_demkni", "TANK", "guardian"))).toBe("defence"); // Saria heals, but she's a Defender
    expect(roleOf(op("char_x", "TANK", "fortress"))).toBe("damage");
    expect(roleOf(op("char_x", "SUPPORT", "blessing"))).toBe("healing");
    expect(roleOf(op("char_x", "SUPPORT", "slower"))).toBe("control");
    expect(roleOf(op("char_x", "SPECIAL", "pusher"))).toBe("special");
    expect(roleOf(op("char_225_haak", "SPECIAL", "geek"))).toBe("control"); // the one override
    for (const cls of CLASS_ORDER) expect(ROLES).toContain(roleOf(op("char_x", cls, "a_branch_from_next_year")));
  });
  it("reads a role from the address", () => {
    expect(parseRole("healing")).toBe("healing");
    expect(parseRole("tank")).toBe("");
    expect(parseRole(null)).toBe("");
  });
});

describe.skipIf(!SERVERS.length)("roles against the built data", () => {
  it.each(SERVERS)("lists every branch on %s", (s) => {
    const ops: OpIndex[] = JSON.parse(readFileSync(resolve(DATA, s, "operators.json"), "utf-8")).ops;
    const missing = [...new Set(ops.filter((o) => !BRANCH_ROLES[o.branch]).map((o) => `${o.cls}/${o.branch}`))];
    expect(missing, "add these branches to src/lib/roles.ts").toEqual([]);
    const ids = new Set(ops.map((o) => o.id));
    for (const id of Object.keys(ROLE_OVERRIDES)) expect(ids.has(id), `${id} in ROLE_OVERRIDES`).toBe(true);
  });
});
