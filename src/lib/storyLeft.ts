// What's left for you in the story, the archives and Annihilation: progress.json's one-time rewards checked against the
// stage clears, archive unlocks, trial rewards and Annihilation kills a sync brought (Account.progress).
import type { ProgressFile, ProgressStage, Retro, Server } from "../types";
import type { RosterOp, StoryProgress } from "../state";
import { nextWeeklyReset } from "./time";

export const OP = 1, CHALLENGE = 2, STORY = 4, CHAR = 8, TRIAL = 16; // stage flags (see ProgressStage)
export const ORUNDUM_PER_PRIME = 180;
const MAX_POT = 6;
const WEEK = 7 * 86400_000;
type Reward = [string, number, string, string];

const stateOf = (p: StoryProgress, id: string) => p.stages[id] || 0;

export interface Tally { combat: number; cleared: number; three: number; opLeft: number }

/** Combat stages (no story, no challenge modes) cleared and at 3★, and Originite Prime still to come (a stage with
 *  some pays it on the first 3★ clear; challenge modes count here too). */
export function tally(stages: ProgressStage[], p: StoryProgress): Tally {
  const t: Tally = { combat: 0, cleared: 0, three: 0, opLeft: 0 };
  for (const [id, , f] of stages) {
    const s = stateOf(p, id);
    if (f & OP && s < 3) t.opLeft++;
    if (f & (STORY | CHALLENGE)) continue;
    t.combat++;
    if (s >= 2) t.cleared++;
    if (s >= 3) t.three++;
  }
  return t;
}

/** An archive trial's stars, counted as the game does for its top threshold: 3 for each counting stage at 3★, 1 for
 *  each challenge mode cleared. */
export function trialStars(r: Retro, p: StoryProgress): number {
  let n = 0;
  for (const [id, , f] of r.stages) {
    if (!(f & TRIAL)) continue;
    const s = stateOf(p, id);
    n += f & CHALLENGE ? (s >= 2 ? 1 : 0) : s >= 3 ? 3 : 0;
  }
  return n;
}

export interface ArchiveLeft {
  open: boolean | null; // null: the sync didn't say
  tally: Tally;
  stars: number;
  reached: Reward[]; // trial rewards your stars reach that aren't claimed yet
  claimable: Reward[]; // of those, the ones you can claim now (archive unlocked, trial open)
  claimed: Set<string>;
}

export function archiveLeft(r: Retro, p: StoryProgress, now = Date.now()): ArchiveLeft {
  const open = p.open ? p.open.includes(r.id) : null;
  const stars = r.trail ? trialStars(r, p) : 0;
  const claimed = new Set(p.claimed?.[r.id] || []);
  const reached = (r.trail?.rewards || []).filter(([id, need]) => stars >= need && !claimed.has(id));
  const trialOpen = !!r.trail && new Date(r.trail.start).getTime() <= now;
  return { open, tally: tally(r.stages, p), stars, reached, claimable: open !== false && trialOpen ? reached : [], claimed };
}

/** Originite Prime still to claim: in content you can play now (main story, supply stages, unlocked archives) and in
 *  archives still locked. */
export function opLeft(data: ProgressFile, p: StoryProgress, now = Date.now()) {
  const out = { main: 0, supply: 0, archives: 0, locked: 0, open: 0 };
  for (const z of data.zones) out[z.kind] += tally(z.stages, p).opLeft;
  for (const r of data.retros) {
    if (new Date(r.start).getTime() > now) continue;
    const left = tally(r.stages, p).opLeft;
    if (p.open && !p.open.includes(r.id)) out.locked += left; else out.archives += left;
  }
  out.open = out.main + out.supply + out.archives;
  return out;
}

/** One map's one-time orundum still to come, or null when the sync had no Annihilation. A milestone counts as paid when
 *  the best kill count reaches it or the game marks it paid. Files built before milestones were listed: a map is
 *  done at 400 kills, untouched below that. */
export function annihilationLeft(a: ProgressFile["annihilation"][number], p: StoryProgress): number | null {
  if (!p.annihilation) return null;
  const inst = p.annihilation[a.id];
  if (!inst) return a.orundum;
  if (!a.ladders) return inst.kills >= 400 || (inst.rewards.length > 0 && inst.rewards.every((x) => x > 0)) ? 0 : a.orundum;
  return a.ladders.reduce((t, [kills, orundum], i) => t + (inst.kills >= kills || (inst.rewards[i] || 0) > 0 ? 0 : orundum), 0);
}

export function annihilationTotalLeft(data: ProgressFile, p: StoryProgress): number | null {
  if (!p.annihilation) return null;
  return data.annihilation.reduce((t, a) => t + (annihilationLeft(a, p) || 0), 0);
}

const weekStart = (s: Server, now: number) => nextWeeklyReset(s, now) - WEEK;

/** This week's Annihilation orundum: what the sync counted, or none yet when the week has turned since. */
export function weekFee(p: StoryProgress, s: Server, now = Date.now()): { got: number; cap: number; left: number } | null {
  if (!p.fee) return null;
  const counted = p.feeTs ? p.feeTs * 1000 : p.at;
  const cap = p.fee[1] || 1800;
  const got = counted >= weekStart(s, now) ? Math.min(p.fee[0], cap) : 0;
  return { got, cap, left: cap - got };
}

/** Event Crystals held now: the synced count, topped up to your level's cap when a Monday has passed since. */
export function crystalsNow(p: StoryProgress, data: ProgressFile, s: Server, now = Date.now()): number | null {
  if (p.coin === undefined) return null;
  if (p.at >= weekStart(s, now) || !data.crystal) return p.coin;
  const cap = Object.entries(data.crystal.cap).filter(([lv]) => (p.level || 0) >= +lv).reduce((m, [, n]) => Math.max(m, n), 0);
  return Math.max(p.coin, cap);
}

/** The operators an archive gives: its trial's operator and any from its stages' first clears. */
export function archiveChars(r: Retro, data: ProgressFile): string[] {
  const out = (r.trail?.rewards || []).filter(([, , type]) => type === "CHAR").map(([, , , id]) => id);
  for (const [cid, srcs] of Object.entries(data.welfare)) {
    if (srcs.some((x) => x.kind === "stage" && x.retro === r.id) && !out.includes(cid)) out.push(cid);
  }
  return out;
}

export interface UnlockPick { r: Retro; why: "missing" | "potential" | "prime"; chars: string[]; opLeft: number }

/** Locked archives worth an Event Crystal, best first: a free operator you don't have, then a full-potential voucher
 *  for one you have below potential 6, then the most Originite Prime. */
export function unlockNext(data: ProgressFile, p: StoryProgress, ops: Record<string, RosterOp>, now = Date.now()): UnlockPick[] {
  if (!p.open) return [];
  const rank = { missing: 0, potential: 1, prime: 2 };
  return data.retros.filter((r) => new Date(r.start).getTime() <= now && !p.open!.includes(r.id)).map((r): UnlockPick => {
    const chars = archiveChars(r, data);
    const missing = chars.filter((c) => !ops[c]);
    const full = r.trail?.rewards.some(([, , type]) => type === "VOUCHER_FULL_POTENTIAL");
    const low = full ? chars.filter((c) => ops[c] && ops[c].pot < MAX_POT) : [];
    const left = tally(r.stages, p).opLeft;
    return missing.length ? { r, why: "missing", chars: missing, opLeft: left }
      : low.length ? { r, why: "potential", chars: low, opLeft: left } : { r, why: "prime", chars: [], opLeft: left };
  }).filter((x) => x.why !== "prime" || x.opLeft > 0).sort((a, b) => rank[a.why] - rank[b.why] || b.opLeft - a.opLeft || a.r.index - b.r.index);
}
