// Roster imports. Accepted, detected by shape:
//   - Novena roster files (this site's own export)
//   - a raw `account/syncData` JSON (what other community tools save), or Novena Sync's cut-down copy of one
//   - Krooster's operator export (an object keyed by char id with owned / promotion / potential / mastery / module)
import type { OpIndex } from "../types";
import type { Account, RosterOp } from "../state";

export const ROSTER_APP = "novena-roster";
const OLD_ROSTER_APPS = ["doctors-toolkit-roster"]; // the working title, before the name Novena

export interface Imported {
  ops: Record<string, RosterOp>;
  depot?: Record<string, number>;
  savings?: Account["savings"];
  format: string;
  skipped: number;
  server?: string; // the server a file says it's from, when it says
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : fallback;
};

function letterMap(ops: OpIndex[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of ops) (o.modIds || []).forEach((id, i) => m.set(id, o.mods[i]));
  return m;
}

function sanitize(r: Partial<RosterOp> & { id: string }, known: Map<string, OpIndex>): RosterOp | null {
  const op = known.get(r.id);
  if (!op) return null;
  const elite = clamp(r.elite, 0, op.rarity >= 4 ? 2 : op.rarity === 3 ? 1 : 0, 0);
  const modules: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.modules || {})) if (/^[A-Z]$/.test(k) && op.mods.includes(k)) modules[k] = clamp(v, 0, 3, 0);
  return {
    id: r.id, elite, level: clamp(r.level, 1, 90, 1), pot: clamp(r.pot, 1, 6, 1), skillLevel: clamp(r.skillLevel, 1, 7, 1),
    masteries: (Array.isArray(r.masteries) ? r.masteries : []).slice(0, 3).map((m) => clamp(m, 0, 3, 0)), modules,
  };
}

export function parseRoster(json: unknown, ops: OpIndex[]): Imported {
  const known = new Map(ops.map((o) => [o.id, o]));
  const letters = letterMap(ops);
  const data = json as Record<string, any>;
  const out: Record<string, RosterOp> = {};
  let skipped = 0;
  const put = (r: (Partial<RosterOp> & { id: string }) | null) => {
    const s = r && sanitize(r, known);
    if (s) out[s.id] = s; else skipped++;
  };

  if ((data?.app === ROSTER_APP || OLD_ROSTER_APPS.includes(data?.app)) && Array.isArray(data.ops)) {
    data.ops.forEach((r: any) => put(r));
    const depot = Object.fromEntries(Object.entries(data.depot || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    return { ops: out, depot, savings: data.savings, format: "Novena roster file", skipped, server: data.server };
  }

  const troop = data?.user?.troop?.chars ?? data?.troop?.chars;
  if (troop && typeof troop === "object") {
    for (const c of Object.values(troop) as any[]) {
      const forms = c.tmpl ? Object.entries(c.tmpl).map(([id, t]: [string, any]) => ({ id, ...t })) : [{ id: c.charId, ...c }];
      for (const f of forms) {
        const modules: Record<string, number> = {};
        for (const [mid, st] of Object.entries((f.equip || {}) as Record<string, any>)) {
          const letter = letters.get(mid);
          if (letter && !st.locked) modules[letter] = Number(st.level) || 0;
        }
        put({ id: f.id, elite: c.evolvePhase, level: c.level, pot: (c.potentialRank || 0) + 1, skillLevel: c.mainSkillLvl,
          masteries: (f.skills || []).map((s: any) => s.specializeLevel || 0), modules });
      }
    }
    const user = data.user ?? data;
    const depot: Record<string, number> = {};
    for (const [k, v] of Object.entries(user.inventory || {})) if (Number(v) > 0) depot[k] = Number(v);
    if (user.status?.gold) depot["4001"] = Number(user.status.gold);
    const st = user.status || {};
    const savings = { orundum: Number(st.diamondShard) || 0, prime: (Number(st.freeDiamond) || 0) + (Number(st.payDiamond) || 0),
      permits: (Number(st.gachaTicket) || 0) + 10 * (Number(st.tenGachaTicket) || 0), card: (st.monthlySubscriptionEndTime || 0) * 1000 > Date.now() };
    const fromApp = data.app === "novena-sync";
    return { ops: out, depot, savings, format: fromApp ? "Novena Sync" : "Game sync data (syncData)", skipped, server: fromApp ? data.server : undefined };
  }

  // Krooster: { char_x: { id, owned, promotion, potential, level, skillLevel, mastery: [..], module: {id|letter: n} } }
  const values = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data) : [];
  if (values.length && values.every((v: any) => v && typeof v === "object" && "owned" in v)) {
    for (const v of values as any[]) {
      if (!v.owned) continue;
      const modules: Record<string, number> = {};
      for (const [k, n] of Object.entries(v.module || {})) {
        const letter = /^[A-Z]$/i.test(k) ? k.toUpperCase() : letters.get(k);
        if (letter && Number(n) > 0) modules[letter] = Number(n);
      }
      put({ id: v.id, elite: v.promotion, level: v.level, pot: v.potential, skillLevel: v.skillLevel,
        masteries: Array.isArray(v.mastery) ? v.mastery : [], modules });
    }
    return { ops: out, format: "Krooster export", skipped };
  }

  throw new Error("Couldn't read this file: it isn't a Novena roster, game sync data or a Krooster export.");
}

export function exportRoster(a: Account, server: string) {
  return { app: ROSTER_APP, version: 1, server, exported: new Date().toISOString(), ops: Object.values(a.ops), depot: a.depot, savings: a.savings };
}
