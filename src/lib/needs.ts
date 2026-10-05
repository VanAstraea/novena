// What your plans call for: the built plan's steps if there is one, otherwise your planner targets (goals), priced
// from your roster; and what your depot (crafting included) is still short of. Shared by the event-shop advisor and
// the training-voucher picks.
import { account, targets } from "../state";
import type { ItemsFile, Meta, OpIndex } from "../types";
import { goalStates, lastPlan, rosterStates } from "./account";
import { add, stateCost, type Cost, type CostData, type OpState } from "./costs";
import { Stock } from "./crafting";

export interface Needs {
  cost: Cost; // everything the plans call for
  short: Cost; // what the depot can't cover, even crafting
  goals: Record<string, OpState>; // operator -> the state your plans take it to
  from: "plan" | "targets" | "none";
}

export function planNeeds(ops: OpIndex[], costs: Record<string, CostData>, meta: Meta, items: ItemsFile): Needs {
  const byId = new Map(ops.map((o) => [o.id, o]));
  const states = rosterStates(account.value, costs);
  const cost: Cost = {};
  const built = lastPlan.value?.result;
  const goals = goalStates(targets.value, states, costs, byId);
  let from: Needs["from"] = "none";
  if (built && (built.goals.length || built.steps.length)) {
    for (const st of [...built.goals, ...built.steps]) add(cost, st.cost);
    from = "plan";
  } else if (Object.keys(goals).length) {
    for (const [id, to] of Object.entries(goals)) if (costs[id] && states[id]) add(cost, stateCost(costs[id], meta.const, states[id], to, !!byId.get(id)?.patch));
    from = "targets";
  }
  const stock = new Stock(account.value.depot, items.recipes);
  const short: Cost = {};
  for (const [id, n] of Object.entries(cost)) Object.assign(short, stock.pay({ [id]: n })); // item by item, as the planner does
  return { cost, short, goals, from };
}
