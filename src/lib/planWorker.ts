// Runs the coverage planner off the main thread, so the page stays responsive while it scores the roster.
import { makePlan, type PlanInput } from "./planner";

self.onmessage = (e: MessageEvent<PlanInput>) => {
  try {
    const result = makePlan(e.data, (phase, done, total) => (self as unknown as Worker).postMessage({ type: "progress", phase, done, total }));
    (self as unknown as Worker).postMessage({ type: "done", result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: (err as Error).message });
  }
};
