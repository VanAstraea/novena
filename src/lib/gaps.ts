// Roster gap analysis (ported from ako's gaps.py): archetypes clears lean on that the roster covers poorly.
//   demand   = how often community clears use at least one operator of the archetype (precomputed, or weighted to
//              what the player plays)
//   coverage = share of the archetype's usage from operators the roster owns, an owned copy below its community
//              build's promotion counting at UNBUILT_WEIGHT
//   gap      = demand × (1 − coverage)
// Each owned operator also carries what it lacks of its community build (promotion, the usual skill's mastery, the
// usual module), which is what "to fill it" suggests raising.
import type { OpIndex, UsageFile } from "../types";
import type { RosterOp } from "../state";

const UNBUILT_WEIGHT = 0.3;

/** What an owned operator lacks of its community build. */
export interface Todo { elite?: number; skill?: number; mastery?: number; module?: string }

export interface GapOption {
  op: OpIndex;
  share: number;
  owned: boolean;
  built: boolean;
  here: boolean;
  todo: Todo | null;
}

export interface Gap {
  branch: string;
  cls: string;
  demand: number;
  coverage: number;
  gap: number;
  options: GapOption[];
}

export function todoFor(r: RosterOp, b: UsageFile["ops"][string]["build"]): Todo | null {
  const t: Todo = {};
  if (b.elite && r.elite < b.elite) t.elite = b.elite;
  if (b.skill && b.mastery && (r.masteries[b.skill - 1] || 0) < b.mastery) { t.skill = b.skill; t.mastery = b.mastery; }
  if (b.module && !(r.modules[b.module] > 0)) t.module = b.module;
  return Object.keys(t).length ? t : null;
}

/** The todo as a Planner goal: "E2, S2 M3, Mod X1". */
export function todoText(t: Todo): string {
  return [t.elite && `E${t.elite}`, t.skill && `S${t.skill} M${t.mastery}`, t.module && `Mod ${t.module}1`].filter(Boolean).join(", ");
}

export function analyse(ops: OpIndex[], usage: UsageFile, roster: Record<string, RosterOp>, server: string,
  demandOf: (branch: string) => number = (b) => usage.archetypes[b]?.score || 0): Gap[] {
  const byBranch = new Map<string, OpIndex[]>();
  for (const o of ops) {
    if (!usage.ops[o.id]?.score || o.patch) continue;
    byBranch.set(o.branch, [...(byBranch.get(o.branch) || []), o]);
  }
  const out: Gap[] = [];
  for (const [branch, members] of byBranch) {
    const demand = demandOf(branch);
    if (!demand) continue;
    const total = members.reduce((s, o) => s + (usage.ops[o.id]?.score || 0), 0);
    if (!total) continue;
    let coverage = 0;
    const options = members.map((o) => {
      const u = usage.ops[o.id]!;
      const share = (u.score || 0) / total;
      const r = roster[o.id];
      const built = !!r && (u.build.elite !== 2 || r.elite >= 2);
      if (r) coverage += share * (built ? 1 : UNBUILT_WEIGHT);
      return { op: o, share, owned: !!r, built, here: o.on.includes(server as never), todo: r ? todoFor(r, u.build) : null };
    }).sort((a, b) => b.share - a.share);
    coverage = Math.min(coverage, 1);
    out.push({ branch, cls: members[0].cls, demand, coverage, gap: demand * (1 - coverage), options });
  }
  return out.sort((a, b) => b.gap - a.gap);
}
