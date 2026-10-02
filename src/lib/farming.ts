// Farming planner (ported from ako's farming.py): the cheapest mix of stage runs and crafts that covers a
// material deficit, as a linear program over Penguin Statistics drop rates, solved in the browser by HiGHS (WASM):
//
//   minimise   Σ sanity_s·runs_s + Σ lmdValue·lmd_f·crafts_f + UNMET·Σ unmet_i
//   subject to inventory_i + Σ rate_si·runs_s + Σ out_fi·crafts_f − Σ in_fi·crafts_f + unmet_i ≥ need_i
//
// Crafting lets it farm a cheaper tier and combine up, as players do. The `unmet` slack keeps the problem
// feasible when something can't be farmed with sanity (Chip Catalyst, module items); those are reported instead.
// LMD and EXP stay outside the program and are reported as balances (they have their own supply stages).
import type { Recipe, StageRow } from "../types";
import { EXP, LMD, type Cost } from "./costs";
import { EXP_CARDS } from "./crafting";

const UNMET = 1e5;
const UNMET_CRAFTABLE = 2 * UNMET; // name the ingredient that can't be farmed, not the product
export const DAILY_SANITY = 240;
const OUTSIDE = new Set([LMD, EXP]);

export interface FarmPlan {
  runs: { stage: StageRow; runs: number }[];
  sanity: number;
  crafts: Record<string, number>;
  unmet: Record<string, number>;
  lmdShort: number;
  expShort: number;
}

type Solver = { solve(lp: string, opts?: Record<string, unknown>): { Status: string; Columns: Record<string, { Primal: number }> } };
let solverP: Promise<Solver> | null = null;

/** Loads HiGHS once. In Node (tests) the package finds its own .wasm; in the browser Vite serves it as an asset. */
export function loadSolver(): Promise<Solver> {
  if (!solverP) {
    solverP = (async () => {
      const { default: loadHighs } = await import("highs");
      if (typeof window === "undefined") return (await loadHighs()) as unknown as Solver;
      const { default: wasm } = await import("highs/runtime?url");
      return (await loadHighs({ locateFile: () => wasm })) as unknown as Solver;
    })();
    solverP.catch(() => (solverP = null));
  }
  return solverP;
}

const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toPrecision(12).replace(/\.?0+(e|$)/, "$1"));

export async function plan(need: Cost, inventory: Record<string, number>, stages: StageRow[],
  recipes: Record<string, Recipe>, lmdValue = 0.0036): Promise<FarmPlan> {
  const inv = { ...inventory };
  const expHeld = (inv[EXP] || 0) + Object.entries(EXP_CARDS).reduce((s, [c, e]) => s + (inv[c] || 0) * e, 0);
  const goal: Cost = {};
  for (const [i, n] of Object.entries(need)) if (n > 0 && !OUTSIDE.has(i)) goal[i] = n;

  // Only items reachable from the goal through recipes matter; stages are kept if they drop any of them.
  const items = new Set<string>();
  const frontier = Object.keys(goal);
  while (frontier.length) {
    const item = frontier.pop()!;
    if (items.has(item)) continue;
    items.add(item);
    if (recipes[item]) frontier.push(...recipes[item].costs.map(([i]) => i));
  }
  OUTSIDE.forEach((i) => items.delete(i));
  const crafts = Object.entries(recipes).filter(([item]) => items.has(item));
  for (const [, f] of crafts) for (const [i] of f.costs) if (!OUTSIDE.has(i)) items.add(i);
  const useful = stages.filter((s) => Object.keys(s.drops).some((i) => items.has(i)));
  const itemList = [...items].sort();

  const obj: string[] = [];
  useful.forEach((s, k) => obj.push(`${num(s.ap)} r${k}`));
  crafts.forEach(([, f], k) => { if (f.lmd * lmdValue) obj.push(`${num(f.lmd * lmdValue)} c${k}`); });
  itemList.forEach((i, k) => obj.push(`${recipes[i] ? UNMET_CRAFTABLE : UNMET} u${k}`));

  const rows: string[] = [];
  itemList.forEach((item, k) => {
    const terms: string[] = [];
    useful.forEach((s, j) => { const r = s.drops[item]; if (r) terms.push(`+ ${num(r)} r${j}`); });
    crafts.forEach(([out, f], j) => {
      let coef = out === item ? f.count : 0;
      for (const [ing, n] of f.costs) if (ing === item) coef -= n;
      if (coef) terms.push(`${coef > 0 ? "+" : "-"} ${num(Math.abs(coef))} c${j}`);
    });
    terms.push(`+ 1 u${k}`);
    rows.push(` i${k}: ${terms.join(" ")} >= ${num((goal[item] || 0) - (inv[item] || 0))}`);
  });
  const lp = `Minimize\n obj: ${obj.join(" + ")}\nSubject To\n${rows.join("\n")}\nEnd\n`;

  const highs = await loadSolver();
  const result = highs.solve(lp, { output_flag: false });
  if (result.Status !== "Optimal") throw new Error(`The farming plan couldn't be solved (${result.Status})`);
  const x = (name: string) => result.Columns[name]?.Primal ?? 0;

  const runs = useful.map((stage, k) => ({ stage, runs: x(`r${k}`) })).filter((r) => r.runs > 1e-6)
    .sort((a, b) => b.runs * b.stage.ap - a.runs * a.stage.ap);
  const made: Record<string, number> = {};
  crafts.forEach(([item], k) => { const v = x(`c${k}`); if (v > 1e-6) made[item] = v; });
  const unmet: Record<string, number> = {};
  itemList.forEach((item, k) => { const v = x(`u${k}`); if (v > 1e-6) unmet[item] = Math.ceil(v - 1e-6); });
  const craftLmd = crafts.reduce((s, [, f], k) => s + f.lmd * x(`c${k}`), 0);
  return {
    runs,
    sanity: runs.reduce((s, r) => s + r.stage.ap * r.runs, 0),
    crafts: made,
    unmet,
    lmdShort: Math.max(0, Math.ceil((need[LMD] || 0) + craftLmd - (inv[LMD] || 0))),
    expShort: Math.max(0, (need[EXP] || 0) - expHeld),
  };
}

// --- schedule ----------------------------------------------------------------------------------------------------

export interface Day {
  offset: number; // 0 = today (the game day)
  weekday: number; // 1 = Monday ... 7 = Sunday
  runs: { code: string; runs: number; sanity: number }[];
}

/** Spread whole runs over the days ahead with natural regeneration only (ako's farming.schedule). `today`: sanity to
 * spend today; each later day adds `daily`, and what a day leaves unspent carries over up to `cap`. A stage that
 * opens on set weekdays goes first on those days, the one open fewest days first. Returns the days and the offset
 * of the last one, or null if the runs don't fit in `horizon` days. */
export function schedule(runs: { code: string; runs: number; sanity: number }[], openDays: Record<string, number[] | null>,
  weekday: number, today: number, cap: number, daily = DAILY_SANITY, horizon = 120): { days: Day[]; last: number | null } {
  const left = new Map(runs.filter((r) => r.runs > 0).map((r) => [r.code, r.runs]));
  const cost = new Map(runs.map((r) => [r.code, r.sanity]));
  const days: Day[] = [];
  let carry = 0;
  for (let d = 0; d < horizon && left.size; d++) {
    const wd = ((weekday - 1 + d) % 7) + 1;
    let budget = d === 0 ? today : Math.min(carry, cap) + daily;
    const here = [...left.keys()].filter((c) => !openDays[c] || openDays[c]!.includes(wd));
    here.sort((a, b) => Number(!openDays[a]) - Number(!openDays[b])
      || (openDays[a]?.length || 0) - (openDays[b]?.length || 0) || (a < b ? -1 : 1));
    const day: Day = { offset: d, weekday: wd, runs: [] };
    for (const code of here) {
      const n = Math.min(left.get(code)!, Math.floor(budget / cost.get(code)!));
      if (n) {
        day.runs.push({ code, runs: n, sanity: n * cost.get(code)! });
        budget -= n * cost.get(code)!;
        const rest = left.get(code)! - n;
        if (rest) left.set(code, rest); else left.delete(code);
      }
    }
    days.push(day);
    carry = budget;
  }
  return { days, last: days.length && !left.size ? days[days.length - 1].offset : null };
}
