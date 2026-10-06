// Operator filters shared by list pages (Rankings, Upcoming): rarity, class, role and, with a roster, owned or not.
// They live in the page's address (r=6,5 · cls=SNIPER · role=healing · own=yes|no) so a filtered view can be shared
// as a link.
import { GIcon } from "./ui";
import { art } from "../lib/data";
import { CLASS_NAMES, CLASS_ORDER } from "../lib/format";
import { parseRole, ROLE_HINTS, ROLE_NAMES, ROLES, roleOf } from "../lib/roles";
import { route, setQuery } from "../lib/router";
import { account, hasRoster } from "../state";
import type { OpIndex } from "../types";

const RARITIES: [number, string][] = [[6, "6★"], [5, "5★"], [4, "4★"], [3, "3★ and below"]];

export function useOpFilters() {
  const q = route.value.query;
  const rarity = (q.get("r") || "").split(",").filter(Boolean).map(Number);
  const cls = q.get("cls") || "";
  const own = q.get("own") || "";
  const role = parseRole(q.get("role"));
  const test = (o: OpIndex) =>
    (!rarity.length || rarity.includes(Math.max(3, o.rarity))) && (!cls || o.cls === cls) && (!role || roleOf(o) === role) &&
    (!own || (own === "yes") === !!account.value.ops[o.id]);
  return { rarity, cls, own, role, test, active: !!(rarity.length || cls || own || role) };
}

/** Role chips (src/lib/roles.ts), on their own for pages that list something other than operators. */
export function RoleChips() {
  const role = parseRole(route.value.query.get("role"));
  return (
    <div class="chips" role="group" aria-label="Role">
      {ROLES.map((r) => <button key={r} class="chip" aria-pressed={role === r} title={ROLE_HINTS[r]} onClick={() => setQuery({ role: role === r ? "" : r })}>{ROLE_NAMES[r]}</button>)}
    </div>
  );
}

/** The filter chips. `classes`: show class chips (pages that already have a class picker leave them out). */
export function OpFilters({ classes = false, owned = true }: { classes?: boolean; owned?: boolean }) {
  const f = useOpFilters();
  const toggle = (r: number) => setQuery({ r: (f.rarity.includes(r) ? f.rarity.filter((x) => x !== r) : [...f.rarity, r]).join(",") });
  return (
    <div class="op-filters">
      <div class="chips" role="group" aria-label="Rarity">
        {RARITIES.map(([r, label]) => <button key={r} class="chip" aria-pressed={f.rarity.includes(r)} onClick={() => toggle(r)}>{label}</button>)}
      </div>
      {classes && (
        <div class="chips" role="group" aria-label="Class">
          {CLASS_ORDER.map((c) => (
            <button key={c} class="chip cls-chip" aria-pressed={f.cls === c} onClick={() => setQuery({ cls: f.cls === c ? "" : c })}><GIcon src={art.classIcon(c)} alt="" size={16} />{CLASS_NAMES[c]}</button>
          ))}
        </div>
      )}
      <RoleChips />
      {owned && hasRoster.value && (
        <div class="seg" role="group" aria-label="Owned">
          {[["", "All"], ["yes", "Owned"], ["no", "Not owned"]].map(([v, label]) => <button key={v} aria-pressed={f.own === v} onClick={() => setQuery({ own: v })}>{label}</button>)}
        </div>
      )}
      {f.active && <button class="small ghost" onClick={() => setQuery({ r: "", own: "", role: "", ...(classes ? { cls: "" } : {}) })}>Clear filters</button>}
    </div>
  );
}
