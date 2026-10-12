// GitHub Pages serves 404.html for any path it doesn't have, so a copy of the app shell there makes deep links
// (/operator/char_x, /compare?ops=...) work. .nojekyll stops Pages from hiding files that start with "_".
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

copyFileSync("dist/index.html", "dist/404.html");
writeFileSync("dist/.nojekyll", "");

// The service worker (src/sw.js, see there) with this build's file list: the app shell is kept ready on install;
// the big files only some pages use (the solver's wasm, the depot screenshot reader) are cached when first used.
// The version comes from the files' contents, so any change to them makes browsers pick up a new worker.
const files = (dir) => readdirSync(`dist/${dir}`).map((f) => `${dir}/${f}`);
const assets = files("assets").sort();
const shell = [
  "index.html", "manifest.webmanifest", "novena-mark.svg", "novena-emblem.svg", "novena-crest.svg", "apple-touch-icon.png",
  "sample-roster.json", "licenses.json",
  ...files("icons"), ...files("fonts").filter((f) => f.endsWith(".woff2")), ...files("bg").filter((f) => f.endsWith(".svg")),
  ...assets.filter((f) => /\.(js|css)$/.test(f) && !/^assets\/worker-/.test(f)),
];
for (const f of shell) if (!existsSync(`dist/${f}`)) throw new Error(`postbuild: dist/${f} is missing`);
const hash = createHash("sha256");
for (const f of [...shell, ...assets]) hash.update(f).update(readFileSync(`dist/${f}`));
const sw = readFileSync("src/sw.js", "utf8");
const build = JSON.stringify({ version: hash.digest("hex").slice(0, 12), shell, assets });
if (!sw.includes("/* BUILD */ {")) throw new Error("postbuild: src/sw.js has no BUILD placeholder");
writeFileSync("dist/sw.js", sw.replace(/\/\* BUILD \*\/ \{[^\n]*\};/, () => `/* BUILD */ ${build};`));
if (!existsSync("dist/data/v1/manifest.json")) {
  console.warn("postbuild: dist/data/v1 is missing. Run the pipeline first (npm run data) or the site will have no data.");
}
