// Items to use (ported from ako's views.py): training vouchers with the operators they're best spent on, potential
// tokens with whose potential they raise, and what expires soonest. Vouchers and expiring items come from Novena Sync
// (the game keeps them apart from the depot) or are typed in; potential tokens are ordinary depot items.
import type { Account, RosterOp } from "../state";
import type { ItemsFile, OpIndex, UsageFile } from "../types";
import { growthCost, masteryCost, sanity, type Const, type Cost, type CostData, type OpState } from "./costs";

const VOUCHER = /^VOUCHER_(LEVELMAX|ELITE_II|SKILL_SPECIALLEVELMAX)_(\d)$/;
export const voucherKind = (items: ItemsFile, id: string) => {
  const m = VOUCHER.exec(items.items[id]?.type || "");
  return m ? { kind: m[1] as "LEVELMAX" | "ELITE_II" | "SKILL_SPECIALLEVELMAX", rarity: Number(m[2]) } : null;
};
export const voucherIds = (items: ItemsFile) => Object.keys(items.items).filter((id) => voucherKind(items, id))
  .sort((a, b) => (items.items[a].sort || 0) - (items.items[b].sort || 0));

export interface Pick { id: string; upgrade: string; planned: boolean; rate: number; sanity: number; cost: Cost }

/** The five best operators to spend a training voucher on: what your plans raise first, then what players most often
 *  raise that far (Yituliu's E2 and M3 rates, or the share of clear guides that use it), then the dearest by hand. */
export function voucherPicks(id: string, items: ItemsFile, roster: Record<string, RosterOp>, ops: Map<string, OpIndex>, costs: Record<string, CostData>,
  c: Const, usage: UsageFile, goals: Record<string, OpState>): Pick[] {
  const v = voucherKind(items, id);
  if (!v) return [];
  const out: Pick[] = [];
  for (const r of Object.values(roster)) {
    const op = ops.get(r.id), d = costs[r.id];
    if (!op || !d || op.rarity !== v.rarity || op.patch) continue;
    const u = usage.ops[r.id], goal = goals[r.id];
    const top = d.phases.length - 1, cap = d.phases[top].max;
    const push = (upgrade: string, cost: Cost, planned: boolean, rate: number) => out.push({ id: r.id, upgrade, planned, rate, cost, sanity: sanity(cost, items.values) });
    if (v.kind === "LEVELMAX") {
      if (r.elite > top || (r.elite === top && r.level >= cap)) continue;
      push(`E${r.elite} L${r.level} → E${top} L${cap}`, growthCost(d, c, r.elite, r.level, top, cap), !!goal && goal.elite >= top && goal.level >= cap, Math.max(u?.inv?.e2 || 0, u?.e2 || 0));
    } else if (v.kind === "ELITE_II") {
      if (r.elite >= 2 || top < 2) continue;
      push(`E${r.elite} L${r.level} → E2`, growthCost(d, c, r.elite, r.level, 2, 1), !!goal && goal.elite >= 2, Math.max(u?.inv?.e2 || 0, u?.e2 || 0));
    } else if (r.elite === 2) {
      r.masteries.forEach((m, i) => {
        if (m >= 3) return;
        const k = String(i + 1);
        const rate = Math.max(u?.inv?.m3?.[k] || 0, (u?.m3?.[k] || 0) * (u?.skill?.[k] || 0));
        push(`S${i + 1} M${m} → M3`, masteryCost(d, i, m, 3), !!goal && (goal.masteries[i] || 0) >= 3, rate);
      });
    }
  }
  return out.sort((a, b) => Number(b.planned) - Number(a.planned) || b.rate - a.rate || b.sanity - a.sanity).slice(0, 5);
}

export interface TokenUse { target: string; note: string; ready: boolean }

/** What a potential token raises: one operator's (p_char_x, class_p_char_x) or any of a rarity and class (tierN_x). */
export function tokenUse(id: string, items: ItemsFile, roster: Record<string, RosterOp>, ops: Map<string, OpIndex>, classLabel: (cls: string) => string): TokenUse | null {
  const own = /^(?:class_)?p_(char_\w+)$/.exec(id);
  if (own) {
    const op = ops.get(own[1]), r = roster[own[1]];
    const name = op?.name || own[1];
    if (!r) return { target: name, note: "not in your roster yet", ready: false };
    if (r.pot >= 6) return { target: name, note: "already at max potential", ready: false };
    return { target: name, note: `Potential ${r.pot} → ${r.pot + 1}`, ready: true };
  }
  for (const [rarity, tier] of Object.entries(items.potential || {})) {
    const cls = Object.entries(tier).find(([, item]) => item === id)?.[0];
    if (!cls) continue;
    const who = Object.values(roster).filter((r) => r.pot < 6 && ops.get(r.id)?.rarity === Number(rarity) && ops.get(r.id)?.cls === cls)
      .sort((a, b) => a.pot - b.pot).map((r) => ops.get(r.id)!.name);
    return { target: `any ${rarity}★ ${classLabel(cls)}`, ready: who.length > 0,
      note: who.length ? `for ${who.slice(0, 4).join(", ")}${who.length > 4 ? " …" : ""}` : "every one you have is at max potential" };
  }
  return null;
}

export interface Expiring { id: string; count: number; ts: number; sanity: number | null }

/** Stacks that run out, soonest first (sanity potions with the sanity they hold). Already expired ones are left out. */
export function expiring(a: Account, items: ItemsFile, now = Date.now()): Expiring[] {
  const out: Expiring[] = [];
  for (const [id, stacks] of Object.entries(a.consumables || {})) {
    for (const st of stacks) {
      if (st.ts > 0 && st.ts * 1000 > now && st.count > 0) out.push({ id, count: st.count, ts: st.ts, sanity: items.items[id]?.ap ? items.items[id].ap! * st.count : null });
    }
  }
  return out.sort((x, y) => x.ts - y.ts);
}

/** Held stacks that don't expire (training vouchers and the like): item -> count. */
export function held(a: Account): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, stacks] of Object.entries(a.consumables || {})) {
    const n = stacks.filter((st) => st.ts < 0).reduce((s, st) => s + st.count, 0);
    if (n > 0) out[id] = n;
  }
  return out;
}
