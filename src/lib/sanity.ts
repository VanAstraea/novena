// Sanity regenerates a point every six minutes up to the cap; above the cap (potions), it doesn't.
export const MINUTES_PER_POINT = 6;
export interface Saved { value: number; cap: number; at: number; notify: boolean }

/** Sanity now and the moment it's full, from what was typed and when. */
export function sanityAt(saved: Saved, now = Date.now()): { now: number; fullAt: number } {
  if (!saved.at || saved.value >= saved.cap) return { now: saved.value, fullAt: saved.at };
  const step = MINUTES_PER_POINT * 60_000;
  return { now: Math.min(saved.cap, saved.value + Math.max(0, Math.floor((now - saved.at) / step))), fullAt: saved.at + (saved.cap - saved.value) * step };
}
