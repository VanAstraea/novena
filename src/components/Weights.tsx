import { CATEGORY_NAMES } from "../lib/format";
import { href } from "../lib/router";
import { CATEGORY_ORDER, contentLevels, customised, LEVELS, setLevel } from "../lib/weights";

/** "What you play": Off / Less / Normal / More per kind of content. */
export function WeightsControl({ compact = false }: { compact?: boolean }) {
  return (
    <details class="weights" open={!compact || customised()}>
      <summary>What you play{customised() ? " (customised)" : ""}</summary>
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
    </details>
  );
}
