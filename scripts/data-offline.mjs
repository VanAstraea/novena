// Build the data from whatever is cached in .cache/ without asking any source for updates (local development).
import { spawnSync } from "node:child_process";

const r = spawnSync("python", ["-m", "dtk_pipeline.build", "--no-copilot", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DTK_OFFLINE: "1", PYTHONPATH: "pipeline", PYTHONIOENCODING: "utf-8" },
});
process.exit(r.status ?? 1);
