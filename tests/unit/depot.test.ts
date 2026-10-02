// Depot recognition on real screenshots. The screenshots and expected results are the library's own test cases
// (github.com/arkntools/depot-recognition/test/cases); they're game screenshots, so they aren't committed here.
// Put them in .cache/dr/cases/<name>/{image.png|jpg,result.json} plus .cache/dr/item.zip (templates built the way
// the browser builds them) to run this; it's skipped otherwise.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Jimp from "jimp";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { prepareTemplate, recognizeDepot } from "../../src/lib/depot/recognize";

const DIR = resolve(__dirname, "../../.cache/dr");
const ready = existsSync(resolve(DIR, "item.zip")) && existsSync(resolve(DIR, "cases"));

describe.skipIf(!ready)("depot recognition on real screenshots", async () => {
  const zip = ready ? await JSZip.loadAsync(readFileSync(resolve(DIR, "item.zip"))) : null;
  const templates = new Map<string, Jimp>();
  if (zip) {
    for (const f of Object.values(zip.files)) {
      if (f.name.endsWith(".png")) templates.set(f.name.replace(".png", ""), prepareTemplate(await Jimp.read(Buffer.from(await f.async("arraybuffer")))));
    }
  }
  // a deliberately stale order: the cases come from older game versions, so the fallback has to do the work
  const order = ready ? JSON.parse(readFileSync(resolve(DIR, "order.json"), "utf-8")) : [];
  const cases = ready ? readdirSync(resolve(DIR, "cases")) : [];
  for (const c of cases) {
    it(c, async () => {
      const file = readdirSync(resolve(DIR, "cases", c)).find((f) => f.startsWith("image"))!;
      const slots = await recognizeDepot(await Jimp.read(resolve(DIR, "cases", c, file)), templates, order);
      const want: Record<string, number> = JSON.parse(readFileSync(resolve(DIR, "cases", c, "result.json"), "utf-8"));
      const got = Object.fromEntries(slots.filter((s) => s.trusted && s.id).map((s) => [s.id, s.count]));
      // every expected item is found with its count (extra items, like the EXP cards the cases leave out, are fine)
      for (const [id, n] of Object.entries(want)) expect([id, got[id]]).toEqual([id, n]);
    }, 60_000);
  }
});
