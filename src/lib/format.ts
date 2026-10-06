export const CLASS_NAMES: Record<string, string> = {
  PIONEER: "Vanguard", WARRIOR: "Guard", TANK: "Defender", SNIPER: "Sniper", CASTER: "Caster", MEDIC: "Medic",
  SUPPORT: "Supporter", SPECIAL: "Specialist",
};
export const CLASS_ORDER = ["PIONEER", "WARRIOR", "TANK", "SNIPER", "CASTER", "MEDIC", "SUPPORT", "SPECIAL"];

export const CATEGORY_NAMES: Record<string, string> = {
  main: "Main story", event: "Events", annihilation: "Annihilation", cc: "Contingency Contract",
  supply: "Supply stages", paradox: "Paradox Simulation", other: "Other (mostly SSS)", is: "Integrated Strategies",
};

export const OBTAIN_NAMES: Record<string, string> = {
  headhunt: "Headhunting & Recruitment", limited: "Limited headhunting", event: "Event reward",
  voucher: "Certificate store", is: "Integrated Strategies", credit: "Credit store", pack: "Gift pack",
  story: "Main story", anniversary: "Anniversary reward", other: "Other",
};

export const ROOM_NAMES: Record<string, string> = {
  CONTROL: "Control Center", POWER: "Power Plant", MANUFACTURE: "Factory", TRADING: "Trading Post",
  DORMITORY: "Dormitory", MEETING: "Reception Room", HIRE: "Office", TRAINING: "Training Room", WORKSHOP: "Workshop",
};

const nf = new Intl.NumberFormat("en");
export const fmt = (n: number) => nf.format(Math.round(n));
export const pct = (x: number | undefined, digits = 1) => (x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`);
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return fmt(n);
}

const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dttf = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
export const date = (t: number | string) => dtf.format(new Date(t));
export const dayTime = (t: number) => dttf.format(new Date(t));

export function relative(t: number | string, now = Date.now()): string {
  const d = (new Date(t).getTime() - now) / 86400_000;
  const r = Math.round(d);
  if (Math.abs(d) < 1) {
    const h = Math.round(d * 24);
    return h === 0 ? "now" : h > 0 ? `in ${h} h` : `${-h} h ago`;
  }
  return r > 0 ? `in ${r} day${r === 1 ? "" : "s"}` : `${-r} day${r === -1 ? "" : "s"} ago`;
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

/** Folds accents and punctuation for search: "Wiš'adel" -> "wisadel". */
export const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, "");
