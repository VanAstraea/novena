// Depot screenshot recognition, built on @arkntools/depot-recognition (MIT, by the Arknights Toolbox authors):
// its item detection, image similarity and digit reading, with one change. The library narrows each slot's
// candidates by the depot's sort order (a binary search), so one item out of its expected place (sort orders change
// between game versions) makes every later slot come out wrong. Here, any slot that isn't recognised confidently is
// compared again against every item.
//
// Runs anywhere Jimp runs: in the browser's worker (src/lib/depot/worker.ts) and in Node for tests.
import Jimp from "jimp";
import { itemDetection } from "@arkntools/depot-recognition/lib/itemDetection";
import { getSims } from "@arkntools/depot-recognition/lib/similarity";
import { recognizeNumbers, splitNumbers } from "@arkntools/depot-recognition/lib/number";
import { isDiffsTooClose, isTrustedSimResult } from "@arkntools/depot-recognition/utils/trustedResult";
import { jimpGaussBlur } from "@arkntools/depot-recognition/utils/jimpUtils";

// the library's geometry: templates are 183 px item art cropped to 151, compared at 100 px with the count masked
const IMG_SL = 100;
const IMG_ORIG_SL = 183;
const IMG_CROP_SL = 151;
const IMG_CROP_XY = (IMG_ORIG_SL - IMG_CROP_SL) / 2;
const NUM_MASK = () => new Jimp(54, 28, "white");
const NUM_MASK_X = 39;
const NUM_MASK_Y = 70;

type Sim = { name: string; diff: number; diffs: [string, number][]; diffsTooClose: boolean } | null;

export interface Slot {
  row: number;
  col: number;
  box: { x: number; y: number; size: number };
  id: string | null; // best match
  diff: number; // 0 = identical
  trusted: boolean;
  alternatives: string[]; // next best matches, for the review list
  count: number;
  countText: string;
  countUnsure: boolean;
}

/** A 183 px template (rarity background + item art) prepared the way the library compares them. */
export function prepareTemplate(img: Jimp): Jimp {
  return jimpGaussBlur(img.crop(IMG_CROP_XY, IMG_CROP_XY, IMG_CROP_SL, IMG_CROP_SL))
    .resize(IMG_SL, IMG_SL, Jimp.RESIZE_BEZIER)
    .composite(NUM_MASK(), NUM_MASK_X, NUM_MASK_Y)
    .circle();
}

function simAgainst(input: Jimp, templates: Map<string, Jimp>, ids: string[]): Sim {
  if (!ids.length) return null;
  const diffs = ids.map((id) => [id, Jimp.diff(input, templates.get(id)!, 0.2).percent] as [string, number]).sort((a, b) => a[1] - b[1]);
  return { name: diffs[0][0], diff: diffs[0][1], diffs, diffsTooClose: isDiffsTooClose(diffs) };
}

export async function recognizeDepot(image: Jimp, templates: Map<string, Jimp>, order: string[], onProgress?: (step: string) => void): Promise<Slot[]> {
  const ids = order.filter((id) => templates.has(id));
  onProgress?.("Finding items");
  const { positions, itemWidth } = itemDetection(image) as { positions: { pos: { x: number; y: number; row: number; col: number } }[]; itemWidth: number };
  if (!positions.length) return [];
  const crops = positions.map(({ pos }) => image.clone().crop(pos.x, pos.y, itemWidth, itemWidth));
  const compare = crops.map((c) => c.clone().resize(IMG_SL, IMG_SL).composite(NUM_MASK(), NUM_MASK_X, NUM_MASK_Y).circle());
  onProgress?.("Matching items");
  const sims: Sim[] = getSims(compare, templates, ids);
  sims.forEach((s, i) => { // the fallback: re-check unsure slots against every item, whatever the sort order says
    if (!isTrustedSimResult(s) || s?.diffsTooClose) {
      const full = simAgainst(compare[i], templates, ids);
      if (full && (!s || full.diff < s.diff)) sims[i] = full;
    }
  });
  onProgress?.("Reading counts");
  const nums = await recognizeNumbers(splitNumbers({ splittedImgs: crops, itemWidth, simResults: sims, IMG_SL }));
  return positions.map(({ pos }, i) => {
    const s = sims[i];
    const n = nums[i] as { text: string; value: number; warn: boolean };
    return {
      row: pos.row, col: pos.col, box: { x: pos.x, y: pos.y, size: itemWidth },
      id: s?.name ?? null, diff: s?.diff ?? 1, trusted: isTrustedSimResult(s) && !s?.diffsTooClose,
      alternatives: (s?.diffs || []).slice(1, 5).map(([id]) => id),
      count: n?.value ?? 1, countText: n?.text ?? "", countUnsure: !!n?.warn || !n?.text,
    };
  });
}
