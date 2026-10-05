// Collects the license of every package the site ships (the production dependency tree) and the fonts it bundles,
// for the Credits page (public/licenses.json) and the plain-text notices (public/THIRD_PARTY_NOTICES.txt).
// Runs before every build, so the list can't go stale.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function findPkgDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const p = join(dir, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return p;
    if (dirname(dir) === dir) return null;
  }
}
function licenseText(dir) {
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.|$)/i.test(n));
  return f ? readFileSync(join(dir, f), "utf8").trim() : "";
}
function repoUrl(p) {
  const r = typeof p.repository === "string" ? p.repository : p.repository?.url;
  if (!r) return p.homepage || "";
  return r.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://").replace(/^github:/, "https://github.com/");
}

const seen = new Map();
function walk(name, from) {
  const dir = findPkgDir(name, from);
  if (!dir || seen.has(dir)) return;
  const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = typeof p.license === "string" ? p.license : p.license?.type || (p.licenses || []).map((l) => l.type || l).join(" OR ") || "See text";
  seen.set(dir, { name: p.name, version: p.version, license, url: repoUrl(p), text: licenseText(dir) });
  for (const dep of Object.keys(p.dependencies || {})) walk(dep, dir);
}
for (const dep of Object.keys(pkg.dependencies || {})) walk(dep, root);

const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const fonts = [
  { name: "Saira", by: "Omnibus-Type", license: "SIL Open Font License 1.1", url: "https://github.com/Omnibus-Type/Saira", text: readFileSync(join(root, "public/fonts/OFL-Saira.txt"), "utf8").trim() },
  { name: "Cormorant Garamond", by: "Christian Thalmann (Catharsis Fonts)", license: "SIL Open Font License 1.1", url: "https://github.com/CatharsisFonts/Cormorant", text: readFileSync(join(root, "public/fonts/OFL-CormorantGaramond.txt"), "utf8").trim() },
];
writeFileSync(join(root, "public/licenses.json"), JSON.stringify({ packages, fonts }));

const rule = "=".repeat(80);
const txt = ["Novena bundles the following open-source software and fonts. Their licenses follow.", ""];
for (const x of [...packages.map((p) => ({ ...p, title: `${p.name} ${p.version} (${p.license})` })), ...fonts.map((f) => ({ ...f, title: `${f.name} font (${f.license})` }))]) {
  txt.push(rule, x.title, x.url, rule, x.text || `Licensed under ${x.license}.`, "");
}
writeFileSync(join(root, "public/THIRD_PARTY_NOTICES.txt"), txt.join("\n"));
console.log(`licenses: ${packages.length} packages, ${fonts.length} fonts`);
