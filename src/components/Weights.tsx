import { CATEGORY_NAMES } from "../lib/format";
import { href } from "../lib/router";
import { CATEGORY_ORDER, contentLevels, customised, LEVELS, setLevel } from "../lib/weights";

/** "What you play": Off / Less / Normal / More per kind of content. Lives in Settings; one setting for the whole site. */
export function WeightsControl() {
  return (
    <div class="weights">
      <div class="weights-grid">
        {CATEGORY_ORDER.map((c) => (
          <div key={c} class="row tight">
            <span class="weights-label">{CATEGORY_NAMES[c] || c}</span>
            <div class="seg" role="group" aria-label={CATEGORY_NAMES[c] || c}>
              {LEVELS.map(([v, label]) => (
                <button key={v} class="small" aria-pressed={(contentLevels.value[c] ?? 1) === v} onClick={() => setLevel(c, v)}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p class="explain" style={{ marginTop: "8px" }}>These are the kinds of stage community clear guides cover. Integrated Strategies and Reclamation Algorithm aren't among them (they have no stage guides), so they can't be weighted here; for IS, the <a href={href("/is")}>IS page</a> has its own picks. "Other" is mostly Stationary Security Service.</p>
    </div>
  );
}

const SHORT: Record<string, string> = { cc: "CC", supply: "Supply", paradox: "Paradox", other: "Other" };

/** One line on the pages that use it: what's set, and a link to change it in Settings. */
export function WeightsChip() {
  const changed = CATEGORY_ORDER.filter((c) => contentLevels.value[c] !== undefined)
    .map((c) => `${SHORT[c] || CATEGORY_NAMES[c] || c} ${LEVELS.find(([v]) => v === contentLevels.value[c])?.[1] ?? contentLevels.value[c]}`);
  return (
    <p class="weights-chip">
      What you play: <strong>{customised() ? `customised (${changed.join(", ")})` : "default mix"}</strong>
      {" "}<span style={{ whiteSpace: "nowrap" }}>· <a href={href("/settings") + "#what-you-play"}>Change</a></span>
    </p>
  );
}
