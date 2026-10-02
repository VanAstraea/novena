// GitHub Pages serves 404.html for any path it doesn't have, so a copy of the app shell there makes deep links
// (/operator/char_x, /compare?ops=...) work. .nojekyll stops Pages from hiding files that start with "_".
import { copyFileSync, existsSync, writeFileSync } from "node:fs";

copyFileSync("dist/index.html", "dist/404.html");
writeFileSync("dist/.nojekyll", "");
if (!existsSync("dist/data/v1/manifest.json")) {
  console.warn("postbuild: dist/data/v1 is missing. Run the pipeline first (npm run data) or the site will have no data.");
}
