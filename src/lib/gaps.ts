// Roster gap analysis (ported from ako's gaps.py): archetypes clears lean on that the roster covers poorly.
//   demand   = how often community clears use at least one operator of the archetype (precomputed)
//   coverage = share of the archetype's usage from operators the roster owns, an owned copy below its community
//              build's promotion counting at UNBUILT_WEIGHT
//   gap      = demand × (1 − coverage)
import type { OpIndex, UsageFile } from "../types";
import type { RosterOp } from "../state";

const UNBUILT_WEIGHT = 0.3;

export interface GapOption {
  op: OpIndex;
  share: number;
  owned: boolean;
  built: boolean;
  here: boolean;
}

export interface Gap {
  branch: string;
  demand: number;
  coverage: number;
  gap: number;
  options: GapOption[];
}

export function analyse(ops: OpIndex[], usage: UsageFile, roster: Record<string, RosterOp>, server: string): Gap[] {
  const byBranch = new Map<string, OpIndex[]>();
  for (const o of ops) {
    if (!usage.ops[o.id]?.score || o.patch) continue;
    byBranch.set(o.branch, [...(byBranch.get(o.branch) || []), o]);
  }
  const out: Gap[] = [];
  for (const [branch, members] of byBranch) {
    const demand = usage.archetypes[branch]?.score;
    if (!demand) continue;
    const total = members.reduce((s, o) => s + (usage.ops[o.id]?.score || 0), 0);
    if (!total) continue;
    let coverage = 0;
    const options = members.map((o) => {
      const share = (usage.ops[o.id]?.score || 0) / total;
      const r = roster[o.id];
      const needE2 = usage.ops[o.id]?.build.elite === 2;
      const built = !!r && (!needE2 || r.elite >= 2);
      if (r) coverage += share * (built ? 1 : UNBUILT_WEIGHT);
      return { op: o, share, owned: !!r, built, here: o.on.includes(server as never) };
    }).sort((a, b) => b.share - a.share);
    coverage = Math.min(coverage, 1);
    out.push({ branch, demand, coverage, gap: demand * (1 - coverage), options });
  }
  return out.sort((a, b) => b.gap - a.gap);
}
