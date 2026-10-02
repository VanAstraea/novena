// Shared building blocks: async loading, icons, items, rich text, ranges, tabs.
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { art, items as loadItems, meta as loadMeta, ranges as loadRanges } from "../lib/data";
import { compact, fmt } from "../lib/format";
import { server } from "../state";
import type { ItemsFile, Meta, OpIndex } from "../types";

// --- async data ------------------------------------------------------------------------------------------------

export interface Async<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** Run `fn` whenever `deps` change; a newer call's result wins over a slower older one. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ loading: true });
  const gen = useRef(0);
  useEffect(() => {
    const mine = ++gen.current;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => mine === gen.current && setState({ data, loading: false }),
      (error: Error) => mine === gen.current && setState({ error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Loading({ what = "data" }: { what?: string }) {
  return <p class="muted" role="status">Loading {what}…</p>;
}

export function Failed({ error }: { error: Error }) {
  return (
    <div class="card" role="alert">
      <p class="bad-text">{error.message}</p>
      <p class="muted">The data files may be updating. Try again in a minute.</p>
      <button onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

/** Renders children once `state` has data; loading and error states otherwise. */
export function Await<T>({ state, what, children }: { state: Async<T>; what?: string; children: (data: T) => ComponentChildren }) {
  if (state.error) return <Failed error={state.error} />;
  if (state.data === undefined) return <Loading what={what} />;
  return <>{children(state.data)}</>;
}

// --- per-server shared data, loaded once and kept in signals ---------------------------------------------------

export const metaSig = signal<Meta | null>(null);
export const itemsSig = signal<ItemsFile | null>(null);
export const rangesSig = signal<Record<string, [number, number][]> | null>(null);

export function loadShared() {
  const s = server.value;
  metaSig.value = null;
  itemsSig.value = null;
  rangesSig.value = null;
  loadMeta(s).then((m) => s === server.value && (metaSig.value = m), () => undefined);
  loadItems(s).then((m) => s === server.value && (itemsSig.value = m), () => undefined);
  loadRanges(s).then((m) => s === server.value && (rangesSig.value = m), () => undefined);
}

// --- pictures --------------------------------------------------------------------------------------------------

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function Avatar({ op, size = "" }: { op: Pick<OpIndex, "id" | "name" | "rarity">; size?: "" | "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar ${size} r${op.rarity}`;
  if (failed) return <span class={cls} aria-hidden="true">{initials(op.name)}</span>;
  return <img class={cls} src={art.avatar(op.id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function Stars({ n }: { n: number }) {
  return <span class={`stars r${n}`} aria-label={`${n} star`} title={`${n}★`}>{"★".repeat(n)}</span>;
}

export function OpLink({ op, sub, size = "sm" }: { op: OpIndex; sub?: ComponentChildren; size?: "" | "sm" | "lg" }) {
  return (
    <a class="op-cell" href={`${import.meta.env.BASE_URL}operator/${op.id}`}>
      <Avatar op={op} size={size} />
      <span>
        <span class="op-name">{op.name}</span> {op.src && <span class="badge cn" title="Not on this server yet">CN only</span>}
        {sub && <><br /><small>{sub}</small></>}
      </span>
    </a>
  );
}

export function ItemIcon({ id, count, title }: { id: string; count?: number; title?: string }) {
  const it = itemsSig.value?.items[id];
  const [failed, setFailed] = useState(false);
  const name = it?.name || id;
  const label = count !== undefined ? `${name} × ${fmt(count)}` : name;
  return (
    <span class="item" title={title || label}>
      {it && !failed
        ? <img src={art.item(it.icon)} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <span class="ph" aria-hidden="true">{name.slice(0, 3)}</span>}
      <span class="sr-only">{label}</span>
      <span aria-hidden="true">{count !== undefined ? <b>{count >= 10000 ? compact(count) : fmt(count)}</b> : name}</span>
    </span>
  );
}

const ORDER = (id: string) => (id === "4001" ? 1e9 : id === "EXP" ? 1e9 + 1 : itemsSig.value?.items[id]?.sort ?? 5e8);

/** A cost as item chips, highest tier first, LMD and EXP last. */
export function Items({ cost, empty = "Nothing" }: { cost: Record<string, number> | [string, number][]; empty?: string }) {
  const entries = (Array.isArray(cost) ? cost : Object.entries(cost)).filter(([, n]) => n);
  if (!entries.length) return <span class="muted">{empty}</span>;
  entries.sort((a, b) => ORDER(a[0]) - ORDER(b[0]));
  return <span class="items">{entries.map(([id, n]) => <ItemIcon key={id} id={id} count={n} />)}</span>;
}

export const itemName = (id: string) => itemsSig.value?.items[id]?.name || id;

// --- rich text and ranges --------------------------------------------------------------------------------------

/** Pipeline markup (escaped text with <b> and <i data-t>) with glossary terms explained on hover. */
export function Rich({ html, class: cls = "" }: { html: string; class?: string }) {
  const terms = metaSig.value?.terms;
  const out = useMemo(() => (terms
    ? html.replace(/<i data-t="([^"]+)">/g, (m, t) => {
      const term = terms[t];
      return term ? `<i data-t="${t}" title="${term.desc.replace(/<[^>]+>/g, "").replace(/"/g, "&quot;")}">` : m;
    })
    : html), [html, terms]);
  return <span class={`rich ${cls}`} dangerouslySetInnerHTML={{ __html: out }} />;
}

export function Range({ id, size = 12 }: { id?: string | null; size?: number }) {
  const grids = id ? rangesSig.value?.[id] : undefined;
  if (!id) return null;
  if (!grids) return <span class="muted">range {id}</span>;
  const cells: [number, number][] = [...grids, [0, 0]];
  const rows = cells.map((g) => g[0]);
  const cols = cells.map((g) => g[1]);
  const [r0, r1, c0, c1] = [Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols)];
  const w = (c1 - c0 + 1) * size;
  const h = (r1 - r0 + 1) * size;
  const set = new Set(grids.map((g) => `${g[0]},${g[1]}`));
  const all: JSX.Element[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const self = r === 0 && c === 0;
      const on = set.has(`${r},${c}`);
      all.push(<rect key={`${r},${c}`} class={self ? "self" : on ? "on" : "cell"} x={(c - c0) * size + 1} y={(r1 - r) * size + 1}
        width={size - 2} height={size - 2} rx="2" />);
    }
  }
  return (
    <svg class="range" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`Attack range: ${grids.length} tiles${set.has("0,0") ? " including its own" : ""}, facing right`}>
      {all}
    </svg>
  );
}

// --- tabs ------------------------------------------------------------------------------------------------------

export function Tabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: { key: K; label: ComponentChildren }[]; value: K; onChange: (k: K) => void; label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + tabs.length) % tabs.length;
    onChange(tabs[j].key);
    refs.current[j]?.focus();
  };
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.key} role="tab" ref={(el) => { refs.current[i] = el; }} aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Explain({ children }: { children: ComponentChildren }) {
  return <p class="explain">{children}</p>;
}

/** Table header cell that sorts. */
export function SortTh({ label, k, sort, setSort, num = false, title }: {
  label: string; k: string; sort: { key: string; dir: 1 | -1 }; setSort: (s: { key: string; dir: 1 | -1 }) => void;
  num?: boolean; title?: string;
}) {
  const active = sort.key === k;
  return (
    <th class={num ? "num" : ""} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} title={title} scope="col">
      <button class="sort" onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : num ? -1 : 1 })}>
        {label}{active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
