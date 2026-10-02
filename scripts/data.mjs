// Run the data pipeline (downloads what's stale, then builds public/data/v1).
import { spawnSync } from "node:child_process";

const r = spawnSync("python", ["-m", "dtk_pipeline.build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PYTHONPATH: "pipeline", PYTHONIOENCODING: "utf-8" },
});
process.exit(r.status ?? 1);
