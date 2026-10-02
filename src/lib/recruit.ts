// Public recruitment combinations (ported from ako's recruit.py).
// Picking tags gives an operator who has all of them; a 6★ only comes with Top Operator; at 9:00 the 1★ and 2★
// are left out (a Robot needs 3:50, a Starter is a 2★ anyway). So a combination of up to three of the five tags
// guarantees the lowest rarity among the operators that have all of them.
import type { RecruitFile } from "../types";

export const TAG = { TOP: 11, SENIOR: 14, STARTER: 17, ROBOT: 28 } as const;

export interface Combo {
  tags: number[];
  rarity: number; // guaranteed
  candidates: { id: string; rarity: number }[]; // best first
  hours: "9:00" | "3:50";
}

function* subsets(tags: number[], max = 3): Generator<number[]> {
  const n = tags.length;
  for (let size = 1; size <= Math.min(max, n); size++) {
    const idx = Array.from({ length: size }, (_, i) => i);
    while (true) {
      yield idx.map((i) => tags[i]);
      let i = size - 1;
      while (i >= 0 && idx[i] === n - size + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

export function combos(tags: number[], data: RecruitFile): Combo[] {
  const out: Combo[] = [];
  for (const combo of subsets(tags)) {
    const want = new Set(combo);
    const low = want.has(TAG.ROBOT) ? 1 : want.has(TAG.STARTER) ? 2 : 3;
    const candidates = data.pool
      .filter((r) => combo.every((t) => r.tags.includes(t)) && r.rarity >= low && (r.rarity < 6 || want.has(TAG.TOP)))
      .map((r) => ({ id: r.id, rarity: r.rarity }))
      .sort((a, b) => b.rarity - a.rarity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!candidates.length) continue;
    out.push({ tags: combo, rarity: Math.min(...candidates.map((c) => c.rarity)), candidates,
      hours: want.has(TAG.ROBOT) ? "3:50" : "9:00" });
  }
  const key = (c: Combo) => c.tags.join(",");
  out.sort((a, b) => b.rarity - a.rarity
    || Number(!a.tags.includes(TAG.TOP)) - Number(!b.tags.includes(TAG.TOP))
    || a.candidates.length - b.candidates.length || a.tags.length - b.tags.length || (key(a) < key(b) ? -1 : 1));
  return out;
}

/** The combinations worth picking: better than 3★, plus Robot alone; a combination is dropped when a smaller one
 * guarantees as much with the same or fewer candidates. */
export function worthPicking(found: Combo[]): Combo[] {
  const keep: Combo[] = [];
  for (const c of found) {
    if (c.rarity < 4 && !c.tags.includes(TAG.ROBOT)) continue;
    if (c.tags.includes(TAG.ROBOT) && c.tags.length > 1) continue;
    const isSub = (k: Combo) => k.tags.length < c.tags.length && k.tags.every((t) => c.tags.includes(t));
    if (keep.some((k) => isSub(k) && k.rarity >= c.rarity && k.candidates.length <= c.candidates.length)) continue;
    keep.push(c);
  }
  return keep;
}
