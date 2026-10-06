// Global search (Ctrl+K, ⌘K or "/"): operators (yours first, recent ones on an empty box), items, stages, pages,
// the sub-pages people look for, and a few actions.
import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { operators, stages as loadStages } from "../lib/data";
import { href, navigate } from "../lib/router";
import { matchScore } from "../lib/search";
import { pref } from "../lib/storage";
import { account, server, theme } from "../state";
import { rememberOperator } from "./OperatorPanel";
import type { OpIndex, StageRow } from "../types";
import { PAGES } from "../pages/registry";
import { Avatar, ItemIcon, itemsSig } from "./ui";

// Pages people look for by what's on them, opened on the right tab; and things to do.
const SUBPAGES: [string, string, Record<string, string>, string[]][] = [
  ["Event shops", "/upcoming", { view: "shops" }, ["shop", "tokens", "event store"]],
  ["Banners and pulls", "/upcoming", { view: "banners" }, ["banner", "headhunting"]],
  ["Contingency Contract", "/upcoming", { view: "cc" }, ["cc"]],
  ["Training Room and Workshop", "/base", {}, ["trainer", "training", "workshop", "byproduct"]],
  ["Dorms and morale", "/base", {}, ["dorm", "morale"]],
  ["Vouchers, tokens and expiring items", "/roster", { tab: "use" }, ["voucher", "potential token", "expiring", "potion"]],
  ["What changed (progress with costs)", "/roster", { tab: "progress" }, ["progress", "history", "spent"]],
  ["Depot from screenshots", "/roster", { tab: "depot" }, ["depot", "screenshot", "inventory"]],
  ["Import a roster or sync", "/roster", { tab: "import" }, ["import", "sync", "krooster"]],
  ["Import guide: Novena Sync", "/guide", { m: "sync" }, ["novena sync", "sync app", "bind email", "local network access"]],
  ["Import guide: Krooster", "/guide", { m: "krooster" }, ["krooster", "krooster profile"]],
  ["Import guide: another browser or device", "/guide", { m: "move" }, ["transfer", "move", "new phone", "another device"]],
  ["Sanity timer and checklist", "/today", {}, ["timer", "checklist", "daily"]],
];
const ACTIONS: { label: string; words: string[]; run: () => void }[] = [
  { label: "Sync with Novena Sync", words: ["sync", "update roster"], run: () => navigate(href("/roster", { tab: "import" })) },
  { label: "Switch between dark and light", words: ["theme", "dark", "light"], run: () => { const order = ["system", "dark", "light"] as const; theme.value = order[(order.indexOf(theme.value) + 1) % 3]; } },
  { label: "My priorities", words: ["priorities", "plan", "what to build", "what to raise next"], run: () => navigate(href("/plan")) },
];

export const searchOpen = signal(false);

interface Hit {
  key: string;
  label: string;
  kind: string;
  run?: () => void;
  to: string;
  score: number;
  op?: OpIndex;
  item?: string;
}

document.addEventListener("keydown", (e) => {
  const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
  if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
    e.preventDefault();
    searchOpen.value = true;
  }
});

export function SearchDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [ops, setOps] = useState<OpIndex[]>([]);
  const [stageRows, setStages] = useState<StageRow[]>([]);
  const open = searchOpen.value;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
      operators(server.value).then(setOps, () => undefined);
      loadStages(server.value).then((s) => setStages(s.stages), () => undefined);
    } else if (!open && d.open) d.close();
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    if (!q.trim()) {
      let recent: string[] = [];
      try { recent = JSON.parse(pref("recentOps", "[]")); } catch { /* none */ }
      const recentHits = recent.map((id) => ops.find((o) => o.id === id)).filter((o): o is OpIndex => !!o)
        .map((op) => ({ key: `r${op.id}`, label: op.name, kind: "Recent", to: href(`/operator/${op.id}`), score: 2, op }));
      return [...recentHits, ...PAGES.filter((p) => p.nav).map((p) => ({ key: p.path, label: p.title, kind: "Page", to: href(p.path), score: 1 }))];
    }
    const out: Hit[] = [];
    for (const op of ops) {
      const s = Math.max(matchScore(q, op.name), op.cn ? matchScore(q, op.cn) : 0, op.alt ? matchScore(q, op.alt) : 0);
      const owned = !!account.value.ops[op.id];
      if (s) out.push({ key: op.id, label: op.name, kind: op.src ? "Operator · CN only" : owned ? "Operator · yours" : "Operator", to: href(`/operator/${op.id}`), score: s + 3 + (owned ? 2 : 0), op });
    }
    for (const [id, it] of Object.entries(itemsSig.value?.items || {})) {
      const s = matchScore(q, it.name);
      if (s) out.push({ key: `i${id}`, label: it.name, kind: "Item", to: href("/farming", { items: `${id}:1` }), score: s, item: id });
    }
    for (const st of stageRows) {
      const s = matchScore(q, st.code);
      if (s >= 55) out.push({ key: `s${st.id}`, label: `${st.code} (${st.ap} sanity)`, kind: "Stage", to: href("/farming", { stage: st.id }), score: s - 5 });
    }
    for (const p of PAGES) {
      const s = Math.max(matchScore(q, p.title), ...(p.keywords || []).map((k) => matchScore(q, k)));
      if (s) out.push({ key: p.path, label: p.title, kind: "Page", to: href(p.path), score: s + 1 });
    }
    for (const [label, path, query, words] of SUBPAGES) {
      const s = Math.max(matchScore(q, label), ...words.map((w) => matchScore(q, w)));
      if (s) out.push({ key: `p${label}`, label, kind: "Page", to: href(path, query), score: s + 1 });
    }
    for (const a of ACTIONS) {
      const s = Math.max(matchScore(q, a.label), ...a.words.map((w) => matchScore(q, w)));
      if (s) out.push({ key: `a${a.label}`, label: a.label, kind: "Action", to: "", run: a.run, score: s });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [q, ops, stageRows]);

  const go = (h: Hit) => {
    searchOpen.value = false;
    if (h.run) return h.run();
    if (h.op) rememberOperator(h.op.id);
    navigate(h.to);
  };

  return (
    <dialog ref={ref} class="search" aria-label="Search" onClose={() => (searchOpen.value = false)}
      onClick={(e) => { if (e.target === ref.current) searchOpen.value = false; }}>
      <div class="search-input">
        <span aria-hidden="true">⌕</span>
        <input ref={input} type="search" value={q} placeholder="Find an operator, item, stage or page"
          aria-label="Search" aria-controls="search-results" role="combobox" list={undefined} aria-expanded="true"
          aria-activedescendant={hits[sel] ? `sr-${sel}` : undefined}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); go(hits[sel]); }
          }} />
        <kbd>Esc</kbd>
      </div>
      <ul id="search-results" class="search-results" role="listbox">
        {hits.map((h, i) => (
          <li key={h.key} id={`sr-${i}`} role="option" aria-selected={i === sel}>
            <a href={h.to} onClick={(e) => { e.preventDefault(); go(h); }} onMouseEnter={() => setSel(i)}>
              {h.op ? <Avatar op={h.op} size="sm" /> : h.item ? <ItemIcon id={h.item} /> : null}
              {!h.item && <span>{h.label}</span>}
              <span class="kind">{h.kind}</span>
            </a>
          </li>
        ))}
        {q.trim() && !hits.length && <li class="muted" style={{ padding: "10px" }}>Nothing matches “{q}”.</li>}
      </ul>
    </dialog>
  );
}
