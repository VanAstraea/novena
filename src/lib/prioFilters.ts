// What the player wants suggested on Priorities, kept apart from the page state so it can be tested on its own:
// classes, kinds of upgrade, a sanity cap per step, and what to leave out (operators, or whole rarities).

/** Rarity as the filters count it: 6★, 5★, 4★, and 3★ standing for 3★ and below. */
export const TIERS = [6, 5, 4, 3];
export const tier = (rarity: number) => Math.max(3, rarity);

export interface PrioFilters {
  cls: string[]; kinds: { promote: boolean; skill: boolean; mastery: boolean; module: boolean }; maxSanity: number;
  /** Operators left out, by id. */
  skip: string[];
  /** Rarities left out (see TIERS). */
  skipRarity: number[];
}
export const NO_FILTERS: PrioFilters = { cls: [], kinds: { promote: true, skill: true, mastery: true, module: true }, maxSanity: 0, skip: [], skipRarity: [] };

/** Saved filters, with anything missing filled in. Older saves picked the rarities to keep ("rarity"); that's the same
 *  choice as leaving out the others. */
export function readFilters(saved: Partial<PrioFilters> & { rarity?: number[] }): PrioFilters {
  const { rarity, ...rest } = saved;
  const f: PrioFilters = { ...NO_FILTERS, ...rest, kinds: { ...NO_FILTERS.kinds, ...rest.kinds } };
  if (rarity?.length) f.skipRarity = [...new Set([...f.skipRarity, ...TIERS.filter((t) => !rarity.includes(t))])];
  return f;
}

export const filtersOn = (f: PrioFilters) => !!(f.cls.length || f.maxSanity || f.skip.length || f.skipRarity.length || Object.values(f.kinds).some((v) => !v));

/** Whether the filters let this operator be suggested at all. */
export const suggestable = (f: PrioFilters, id: string, o: { rarity: number; cls: string }) =>
  !f.skip.includes(id) && !f.skipRarity.includes(tier(o.rarity)) && (!f.cls.length || f.cls.includes(o.cls));

/** The planner's share of the filters: which of the owned operators it may raise, which kinds of upgrade, the cap. */
export function planFilters(f: PrioFilters, owned: string[], ops: Map<string, { rarity: number; cls: string }>) {
  if (!filtersOn(f)) return {};
  const only = owned.filter((id) => { const o = ops.get(id); return !!o && suggestable(f, id, o); });
  return { only, kinds: f.kinds, maxSanity: f.maxSanity || undefined };
}
