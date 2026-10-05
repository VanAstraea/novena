// A searchable operator picker (combobox): type a name, pick with the arrows and Enter, or click.
import { useId, useMemo, useState } from "preact/hooks";
import { best } from "../lib/search";
import type { OpIndex } from "../types";
import { Avatar, Stars } from "./ui";

export function OpPicker({ ops, onPick, label = "Add an operator", placeholder = "Operator name…", exclude = [] }: {
  ops: OpIndex[]; onPick: (op: OpIndex) => void; label?: string; placeholder?: string; exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const id = useId();
  const results = useMemo(() => (q.trim() ? best(q, ops.filter((o) => !exclude.includes(o.id)), (o) => [o.name, o.cn, o.alt], 8) : []),
    [q, ops, exclude]);
  const pick = (op: OpIndex) => {
    onPick(op);
    setQ("");
    setSel(0);
  };
  return (
    <div class="picker" style={{ position: "relative", maxWidth: "420px" }}>
      <label class="field">
        <span>{label}</span>
        <input type="search" role="combobox" list={undefined} aria-expanded={results.length > 0} aria-controls={`${id}-list`}
          aria-activedescendant={results.length ? `${id}-${sel}` : undefined} value={q} placeholder={placeholder}
          autocomplete="off" onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && results[sel]) { e.preventDefault(); pick(results[sel]); }
            else if (e.key === "Escape") setQ("");
          }} />
      </label>
      {results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" class="search-results card" style={{ position: "absolute", zIndex: 10, left: 0, minWidth: "min(340px, 90vw)", width: "100%", padding: "4px" }}>
          {results.map((op, i) => (
            <li key={op.id} id={`${id}-${i}`} role="option" aria-selected={i === sel}>
              <a href="#" onClick={(e) => { e.preventDefault(); pick(op); }} onMouseEnter={() => setSel(i)}>
                <Avatar op={op} size="sm" /> {op.name} <Stars n={op.rarity} />
                {op.src && <span class="badge cn">CN only</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
