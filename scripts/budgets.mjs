// Size budgets for the built site (run after npm run build): gzipped sizes of the core JS (the entry script and
// everything it imports statically, which every page waits for), each lazily loaded chunk, the CSS and the data files.
// Prints a table and exits non-zero when anything is over. Budgets sit roughly 10-15% above the sizes when they were
// set: raise one deliberately, in the same change that needs it, never just to make CI pass.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGET = {
  core: 41 * KB, // index + its static imports, together
  chunk: 10 * KB, // each lazily loaded chunk (a page, or code pages share) not named below
  // by name, before the hash: the solver (Farming, Priorities, Sanity Dump) and the depot screenshot reader load only
  // when used
  chunks: { Roster: 15 * KB, highs: 34 * KB, "highs.wasm": 1320 * KB, worker: 540 * KB },
  css: { index: 14.5 * KB, intro: 1.5 * KB },
  data: {
    "en/base.json": 20.5 * KB, "en/costs.json": 32.5 * KB, "en/is.json": 9.5 * KB, "en/items.json": 12 * KB,
    "en/meta.json": 11.5 * KB, "en/operators.json": 21.5 * KB, "en/progress.json": 21 * KB, "en/ranges.json": 1 * KB,
    "en/recruit.json": 2.5 * KB, "en/shops.json": 2 * KB, "en/stages.json": 13.5 * KB, "en/upcoming.json": 9 * KB,
    "en/ops/*": 3 * KB, // the largest single operator file
    "common/usage.json": 40 * KB,
    // TODO: generous on purpose while the guidebook is being reduced separately; bring it down to ~10% above its size
    // once that has landed.
    "common/guidebook.json": 650 * KB,
  },
};

const DIST = "dist";
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const rows = []; // [what, file, size, budget]
const add = (what, file, size, budget) => rows.push({ what, file, size, budget });

// JS: the entry and its static imports (followed through every chunk), then everything else that is lazy
const html = readFileSync(join(DIST, "index.html"), "utf8");
const entry = html.match(/<script type="module"[^>]*src="[^"]*\/assets\/([^"]+\.js)"/)?.[1];
if (!entry) throw new Error("budgets: no entry script in dist/index.html (run npm run build first)");
const STATIC = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[\w$*{},\s]*?\s*from\s*)?["']\.\/([^"']+\.js)["']/g;
const core = new Set();
const visit = (f) => {
  if (core.has(f)) return;
  core.add(f);
  for (const m of readFileSync(join(DIST, "assets", f), "utf8").matchAll(STATIC)) visit(m[1]);
};
visit(entry);
for (const m of html.matchAll(/<link rel="modulepreload"[^>]*href="[^"]*\/assets\/([^"]+\.js)"/g)) visit(m[1]);
const coreSize = [...core].reduce((n, f) => n + gz(join(DIST, "assets", f)), 0);
add("core JS", [...core].map((f) => f.replace(/-[\w-]{8}\.js$/, "")).join(" + "), coreSize, BUDGET.core);

const assets = readdirSync(join(DIST, "assets"));
for (const f of assets.filter((f) => /\.(js|wasm)$/.test(f) && !core.has(f)).sort()) {
  const name = f.replace(/-[\w-]{8}\.js$/, "").replace(/-[\w-]{8}\.wasm$/, ".wasm");
  add("chunk", name, gz(join(DIST, "assets", f)), BUDGET.chunks[name] ?? BUDGET.chunk);
}
for (const f of assets.filter((f) => f.endsWith(".css")).sort()) {
  const name = f.replace(/-[\w-]{8}\.css$/, "");
  add("CSS", `${name}.css`, gz(join(DIST, "assets", f)), BUDGET.css[name] ?? BUDGET.css.index);
}

// data: as deployed (the pipeline's output, copied into dist by the build)
const DATA = join(DIST, "data", "v1");
if (!existsSync(DATA)) console.warn("budgets: dist/data/v1 is missing (run the pipeline first); data files not checked");
else for (const [rel, budget] of Object.entries(BUDGET.data)) {
  if (rel.endsWith("/*")) {
    const dir = join(DATA, rel.slice(0, -2));
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    const sizes = files.map((f) => [f, gz(join(dir, f))]).sort((a, b) => b[1] - a[1]);
    add("data", sizes.length ? `${rel.slice(0, -1)}${sizes[0][0]} (largest of ${files.length})` : rel, sizes[0]?.[1] ?? NaN, budget);
  } else add("data", rel, existsSync(join(DATA, rel)) ? gz(join(DATA, rel)) : NaN, budget);
}

const k = (n) => (Number.isNaN(n) ? "missing" : `${(n / KB).toFixed(1)} KB`);
const over = rows.filter((r) => !(r.size <= r.budget));
const w = Math.max(...rows.map((r) => r.file.length), 4);
console.log(`${"".padEnd(8)} ${"file".padEnd(w)} ${"gzip".padStart(10)} ${"budget".padStart(10)}  used`);
for (const r of rows) {
  const pct = Number.isNaN(r.size) ? "" : `${Math.round((r.size / r.budget) * 100)}%`;
  console.log(`${r.what.padEnd(8)} ${r.file.padEnd(w)} ${k(r.size).padStart(10)} ${k(r.budget).padStart(10)}  ${pct.padStart(4)}${r.size <= r.budget ? "" : "  OVER"}`);
}
if (over.length) {
  console.error(`\nbudgets: ${over.length} over budget: ${over.map((r) => r.file).join(", ")}`);
  process.exit(1);
}
console.log(`\nbudgets: all ${rows.length} within budget`);
