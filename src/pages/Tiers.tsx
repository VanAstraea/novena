// Tier lists: make your own, keep several in this browser, and share one as a link that holds the whole list.
// Operators move by dragging (mouse, or a long press on touch), by tapping one and then a tier, or from the keyboard
// (Enter picks one up, the arrow keys move it, Enter puts it down). The model and the link format live in
// lib/tierlist.ts; the picture in lib/tierImage.ts, loaded when asked for.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { OpFilters, useOpFilters } from "../components/OpFilters";
import { toast, undoable } from "../components/Toast";
import { Await, Avatar, Explain, Loading, useAsync } from "../components/ui";
import { operators, usage as loadUsage } from "../lib/data";
import { href, navigate, route } from "../lib/router";
import { matchScore } from "../lib/search";
import {
  blankList, COLOR_NAMES, COLORS, decodeShare, encodeShare, fromFile, fromUsage, LIMITS, moveOp, newId, nextTier, tierOf, toFile,
  type Tier, type TierList,
} from "../lib/tierlist";
import { account, hasRoster, server } from "../state";
import type { OpIndex } from "../types";

// --- the lists, kept in this browser -------------------------------------------------------------------------------

interface Store { lists: TierList[]; current: string }
const KEY = "novena.tierlists";

function loadStore(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Store | null;
    if (s && Array.isArray(s.lists)) return { lists: s.lists.filter((l) => l && Array.isArray(l.tiers)), current: String(s.current || "") };
  } catch { /* blocked or broken: start empty */ }
  return { lists: [], current: "" };
}

const store = signal<Store>(loadStore());

function save(s: Store) {
  store.value = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* blocked or full: kept for this visit */ }
}
const saveList = (l: TierList) => save({ ...store.value, lists: store.value.lists.map((x) => (x.id === l.id ? l : x)) });
const addList = (l: TierList) => save({ lists: [...store.value.lists, l], current: l.id });

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "tier-list";
const byRarity = (a: OpIndex, b: OpIndex) => b.rarity - a.rarity || a.name.localeCompare(b.name);

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- the page ------------------------------------------------------------------------------------------------------

export default function Tiers() {
  const s = server.value;
  const st = useAsync(() => operators(s), [s]);
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  void route.value; // a link to /tiers from a shared list drops the hash: draw again
  const code = location.hash.startsWith("#t=") ? location.hash.slice(3) : "";
  return (
    <div class="stack fade-in">
      <h1>Tier lists</h1>
      <Await state={st} what="operators">
        {(ops) => (code ? <Shared code={code} ops={ops} /> : <Lists ops={ops} />)}
      </Await>
    </div>
  );
}

function Lists({ ops }: { ops: OpIndex[] }) {
  const st = store.value;
  const list = st.lists.find((l) => l.id === st.current) || st.lists[0];
  const [starting, setStarting] = useState(false);
  if (!list || starting) return <Start ops={ops} done={() => setStarting(false)} cancel={list ? () => setStarting(false) : undefined} />;
  return <Editor key={list.id} list={list} ops={ops} onNew={() => setStarting(true)} />;
}

function Start({ ops, done, cancel }: { ops: OpIndex[]; done: () => void; cancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const n = store.value.lists.length;
  const fromUsageList = async () => {
    setBusy(true);
    try {
      const u = await loadUsage();
      const l = blankList("Community usage");
      l.tiers = fromUsage(ops.filter((o) => !o.src).map((o) => [o.id, u.ops[o.id]?.score || 0]));
      addList(l);
      done();
    } catch (e) {
      toast((e as Error).message || "Couldn't load the usage data", { kind: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="card">
      <h2>{n ? "Start another tier list" : "Make a tier list"}</h2>
      <p class="muted">Pick a starting point. You can rename, recolour, add and remove tiers afterwards.</p>
      <div class="tl-starts">
        <button onClick={() => { addList(blankList(n ? `Tier list ${n + 1}` : "My tier list")); done(); }}>
          <strong>Blank</strong><small>Five empty tiers, S to D, and every operator unranked.</small>
        </button>
        <button onClick={() => void fromUsageList()} disabled={busy}>
          <strong>{busy ? "Loading…" : "From community usage"}</strong><small>The top 5% by community usage in S, the next 10% in A, then B, C and D. Move them from there.</small>
        </button>
        <button onClick={() => { addList(blankList("My roster", true)); done(); }} disabled={!hasRoster.value}>
          <strong>My roster only</strong><small>{hasRoster.value ? "Blank tiers, with only the operators you own to place." : "Add your operators on My roster first."}</small>
        </button>
      </div>
      {cancel && <button class="ghost" style={{ marginTop: "10px" }} onClick={cancel}>Cancel</button>}
    </section>
  );
}

// --- a shared list, read only --------------------------------------------------------------------------------------

function Shared({ code, ops }: { code: string; ops: OpIndex[] }) {
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const st = useAsync(() => decodeShare(code, ops.map((o) => o.id)), [code, ops]);
  if (st.error) {
    return (
      <section class="card">
        <h2>This link couldn't be read</h2>
        <p class="muted">It may have been cut short when it was copied. Ask for the link again, or open your own lists.</p>
        <a class="btn" href={href("/tiers")}>My tier lists</a>
      </section>
    );
  }
  if (!st.data) return <Loading what="the tier list" />;
  const { list, missing } = st.data;
  const copy = () => {
    addList({ ...list, id: newId(), updated: Date.now() });
    navigate(href("/tiers"));
    toast("Copied to your tier lists. It's yours to change.");
  };
  return (
    <>
      <section class="card">
        <p class="eyebrow">Shared tier list</p>
        <h2 class="tl-shared-title">{list.title}</h2>
        <p class="muted">Opened from a link: the whole list is in the address, nothing was uploaded.{list.roster ? " Made from the sharer's own roster." : ""}</p>
        {missing > 0 && <p class="warn-text">{missing === 1 ? "One operator in this list isn't" : `${missing} operators in this list aren't`} in this site's data, so {missing === 1 ? "it was" : "they were"} left out.</p>}
        <div class="row">
          <button class="primary" onClick={copy}>Make a copy to edit</button>
          <ImageButton list={list} byId={byId} />
          <a class="btn ghost" href={href("/tiers")}>My tier lists</a>
        </div>
      </section>
      <div class="tl-board">
        {list.tiers.map((t, i) => (
          <section key={i} class="tl-row" style={{ "--tc": `var(--${t.color})` }}>
            <div class={`tl-label${t.color === "surface-3" ? " plain" : ""}`}><span class="tl-name">{t.name}</span></div>
            <div class="tl-zone">
              <div class="tl-ops" role="group" aria-label={`${t.name}: ${t.ops.length} operators`}>
                {t.ops.map((id) => byId.get(id)).filter(Boolean).map((o) => (
                  <a key={o!.id} class="tl-op" href={`${import.meta.env.BASE_URL}operator/${o!.id}`} data-panel={o!.id} title={o!.name}>
                    <Avatar op={o!} size="sm" /><span class="tl-nm">{o!.name}</span>
                  </a>
                ))}
                {!t.ops.length && <span class="tl-empty">Nobody here</span>}
              </div>
              {t.note && <p class="tl-note">{t.note}</p>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ImageButton({ list, byId }: { list: TierList; byId: Map<string, OpIndex> }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const { tierImage } = await import("../lib/tierImage");
      download(`${slug(list.title)}.png`, await tierImage(list, byId));
      toast("Image saved.");
    } catch (e) {
      toast((e as Error).message || "Couldn't make the image", { kind: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return <button onClick={() => void make()} disabled={busy} title="A picture of the list, drawn in this browser">{busy ? "Drawing…" : "Save as image"}</button>;
}

// --- dragging ------------------------------------------------------------------------------------------------------

/** Where a drop would land: a tier (or -1, unranked) and the place in it. */
interface Target { c: number; index: number; id?: string }
interface DndApi { drop: (id: string, t: Target) => void; show: (t: Target | null) => void }

/** Pointer-event dragging: a mouse drags once it moves a few pixels; a finger or pen after a short press, so a swipe
 *  still scrolls the page. A copy of the chip follows the pointer, and the page scrolls near the top and bottom. */
function makeDnd(api: { current: DndApi }) {
  interface Drag { id: string; pid: number; x0: number; y0: number; x: number; y: number; ox: number; oy: number; touch: boolean; active: boolean; el: HTMLElement; ghost?: HTMLElement; target: Target | null; timer?: number; raf?: number }
  let d: Drag | null = null;

  const targetAt = (x: number, y: number): Target | null => {
    const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    if (!zone || !d) return null;
    const c = Number(zone.dataset.drop);
    if (c < 0) return { c, index: 0 };
    const chips = [...zone.querySelectorAll<HTMLElement>(".tl-op")].filter((ch) => ch.dataset.op !== d!.id);
    let index = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { index = i; break; }
    }
    return { c, index };
  };
  const place = () => {
    if (!d?.ghost) return;
    d.ghost.style.transform = `translate(${d.x - d.ox}px, ${d.y - d.oy}px)`;
    const t = targetAt(d.x, d.y);
    if (t?.c !== d.target?.c || t?.index !== d.target?.index) { d.target = t; api.current.show(t && { ...t, id: d.id }); }
  };
  const scroll = () => {
    if (!d?.active) return;
    const v = d.y < 60 ? -14 : d.y > innerHeight - 60 ? 14 : 0;
    if (v) { scrollBy(0, v); place(); }
    d.raf = requestAnimationFrame(scroll);
  };
  const begin = () => {
    if (!d || d.active) return;
    d.active = true;
    const r = d.el.getBoundingClientRect();
    d.ox = d.x0 - r.left; d.oy = d.y0 - r.top;
    const g = d.el.cloneNode(true) as HTMLElement;
    g.className = "tl-op tl-ghost";
    g.setAttribute("aria-hidden", "true");
    g.style.width = `${r.width}px`;
    document.body.appendChild(g);
    d.ghost = g;
    d.el.classList.add("tl-dragging");
    place();
    scroll();
  };
  const end = () => {
    if (!d) return;
    clearTimeout(d.timer);
    if (d.raf) cancelAnimationFrame(d.raf);
    d.ghost?.remove();
    d.el.classList.remove("tl-dragging");
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    document.removeEventListener("touchmove", touchmove);
    d = null;
    api.current.show(null);
  };
  const move = (e: PointerEvent) => {
    if (!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    if (d.active) return place();
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > 8) {
      if (d.touch) end(); // a swipe: let the page scroll
      else begin();
    }
  };
  const up = (e: PointerEvent) => {
    if (!d || e.pointerId !== d.pid) return;
    const was = d, drop = e.type === "pointerup" ? d.target : null;
    end();
    if (!was.active) return;
    // the click that follows a drag isn't a tap
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", stop, { capture: true }), 0);
    if (drop) api.current.drop(was.id, drop);
  };
  const touchmove = (e: TouchEvent) => { if (d?.active && e.cancelable) e.preventDefault(); };

  return {
    down(e: PointerEvent, id: string) {
      if (e.button !== 0 || d) return;
      d = { id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ox: 0, oy: 0, touch: e.pointerType !== "mouse",
        active: false, el: e.currentTarget as HTMLElement, target: null };
      if (d.touch) d.timer = window.setTimeout(begin, 280);
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
      document.addEventListener("touchmove", touchmove, { passive: false });
    },
  };
}

// --- the editor ----------------------------------------------------------------------------------------------------

function Editor({ list, ops, onNew }: { list: TierList; ops: OpIndex[]; onNew: () => void }) {
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const ids = useMemo(() => ops.map((o) => o.id), [ops]);
  const [sel, setSel] = useState<string | null>(null);
  const [focusId, setFocusId] = useState("");
  const [say, setSay] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [drop, setDrop] = useState<Target | null>(null);
  const [q, setQ] = useState("");
  const [link, setLink] = useState("");
  const refocus = useRef<string | null>(null);
  const filters = useOpFilters();
  const owned = account.value.ops;

  useLayoutEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`.tl-op[data-op="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });
  useEffect(() => setLink(""), [list]);

  const name = (id: string) => byId.get(id)?.name || id;
  const where = (l: TierList, id: string) => {
    const t = tierOf(l, id);
    return t < 0 ? `${name(id)}: unranked.` : `${name(id)}: ${l.tiers[t].name}, ${l.tiers[t].ops.indexOf(id) + 1} of ${l.tiers[t].ops.length}.`;
  };
  const move = (id: string, to: number, index?: number) => {
    const l = moveOp(list, id, to, index);
    saveList(l);
    setSay(where(l, id));
  };
  const update = (l: Partial<TierList>) => saveList({ ...list, ...l, updated: Date.now() });
  const setTier = (i: number, t: Partial<Tier>) => update({ tiers: list.tiers.map((x, j) => (j === i ? { ...x, ...t } : x)) });

  const api = useRef<DndApi>({ drop: () => {}, show: () => {} });
  api.current = { drop: (id, t) => { move(id, t.c, t.index); setSel(null); }, show: setDrop };
  const dnd = useMemo(() => makeDnd(api), []);

  // what's shown: tiers' operators the data knows, and the unranked pool (filtered)
  const rows = list.tiers.map((t) => t.ops.filter((id) => byId.has(id)));
  const placed = new Set(rows.flat());
  const pool = useMemo(() => {
    const query = q.trim();
    return ops.filter((o) => !placed.has(o.id) && (!list.roster || owned[o.id]) && filters.test(o) &&
      (!query || Math.max(matchScore(query, o.name), o.cn ? matchScore(query, o.cn) : 0, o.alt ? matchScore(query, o.alt) : 0) >= 45))
      .sort(byRarity).map((o) => o.id);
  }, [ops, list, q, filters.rarity.join(), filters.cls, filters.role, filters.own, owned]);
  const groups = [...rows, pool]; // the pool is the last group for the arrow keys
  const last = groups.length - 1;

  const pick = (id: string | null) => {
    setSel(id);
    if (id) setSay(`${name(id)} picked up. Arrow keys move it, or choose a tier. Enter puts it down.`);
  };
  const moveSel = (to: number) => {
    if (!sel) return;
    refocus.current = sel;
    move(sel, to);
    setSel(null);
  };
  const focusChip = (id?: string) => id && document.querySelector<HTMLElement>(`.tl-op[data-op="${id}"]`)?.focus();
  const onKey = (e: KeyboardEvent, id: string, g: number, i: number) => {
    const k = e.key;
    if (k === "Escape" && sel) { e.preventDefault(); setSel(null); setSay(`${name(id)} put down.`); return; }
    if ((k === "Delete" || k === "Backspace") && g < last) { e.preventDefault(); refocus.current = id; move(id, -1); return; }
    const dx = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0, dy = k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0;
    if (!dx && !dy && k !== "Home" && k !== "End") return;
    e.preventDefault();
    if (sel === id) { // carrying it: the arrows move it
      if (dx && g < last) {
        const to = i + dx;
        if (to >= 0 && to < groups[g].length) { refocus.current = id; move(id, g, to); }
      } else if (dy) {
        const to = g + dy;
        if (to >= 0 && to <= last) { refocus.current = id; move(id, to === last ? -1 : to, Math.min(i, groups[to].length)); }
      }
      return;
    }
    if (k === "Home") return focusChip(groups[g][0]);
    if (k === "End") return focusChip(groups[g][groups[g].length - 1]);
    if (dx) return focusChip(groups[g][i + dx]);
    for (let to = g + dy; to >= 0 && to <= last; to += dy) {
      if (groups[to].length) return focusChip(groups[to][Math.min(i, groups[to].length - 1)]);
    }
  };

  const chip = (id: string, g: number, i: number) => {
    const o = byId.get(id)!;
    const roving = groups[g].includes(focusId) ? focusId === id : i === 0;
    return (
      <button key={id} type="button" class="tl-op" data-op={id} aria-pressed={sel === id} tabIndex={roving ? 0 : -1} title={o.name}
        aria-describedby="tl-keys" onPointerDown={(e) => dnd.down(e as unknown as PointerEvent, id)} onClick={() => pick(sel === id ? null : id)}
        onKeyDown={(e) => onKey(e as unknown as KeyboardEvent, id, g, i)} onFocus={() => setFocusId(id)} onContextMenu={(e) => e.preventDefault()}>
        <Avatar op={o} size="sm" /><span class="tl-nm">{o.name}</span>
      </button>
    );
  };
  const withMark = (g: number, items: string[]) => {
    const out = items.map((id, i) => chip(id, g, i));
    if (drop && drop.c === g) {
      // the drop index counts the dragged chip out
      let pos = items.length, seen = 0;
      for (let i = 0; i < items.length; i++) {
        if (items[i] === drop.id) continue;
        if (seen === drop.index) { pos = i; break; }
        seen++;
      }
      out.splice(pos, 0, <span key="mark" class="tl-mark" aria-hidden="true" />);
    }
    return out;
  };

  // --- the lists bar ---
  const st = store.value;
  const duplicate = () => addList({ ...structuredClone(list), id: newId(), title: `${list.title} (copy)`.slice(0, LIMITS.title), updated: Date.now() });
  const remove = () => {
    const before = store.value;
    const lists = before.lists.filter((l) => l.id !== list.id);
    save({ lists, current: lists[Math.max(0, before.lists.indexOf(list) - 1)]?.id || "" });
    undoable(`Deleted "${list.title}".`, () => save(before));
  };
  const share = async () => {
    const code = await encodeShare(list, ids);
    const url = `${location.origin}${href("/tiers")}#t=${code}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Anyone who opens it sees this list.");
    } catch {
      toast("Copy the link below.");
    }
  };
  const exportFile = () => download(`${slug(list.title)}.json`, new Blob([JSON.stringify(toFile(list), null, 1)], { type: "application/json" }));
  const importFile = async (file: File) => {
    try {
      const { list: l, missing } = fromFile(JSON.parse(await file.text()), ids);
      addList(l);
      toast(missing ? `Imported "${l.title}". ${missing} unknown operator${missing === 1 ? " was" : "s were"} left out.` : `Imported "${l.title}".`);
    } catch (e) {
      toast(e instanceof SyntaxError ? "That file isn't a tier list." : (e as Error).message, { kind: "bad" });
    }
  };
  const removeTier = (i: number) => {
    const before = list;
    setEditing(null);
    update({ tiers: list.tiers.filter((_, j) => j !== i) });
    undoable(`Removed the ${before.tiers[i].name || "unnamed"} tier.`, () => saveList(before));
  };
  const swap = (i: number, j: number) => {
    const tiers = [...list.tiers];
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
    update({ tiers });
    setEditing(j);
  };

  return (
    <>
      <section class="card tl-top">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Your lists</span>
            <select value={list.id} onChange={(e) => save({ ...st, current: (e.target as HTMLSelectElement).value })}>
              {st.lists.map((l) => <option key={l.id} value={l.id}>{l.title || "Untitled"}</option>)}
            </select>
          </label>
          <button onClick={onNew}>New list</button>
          <button onClick={duplicate}>Duplicate</button>
          <button class="ghost" onClick={remove}>Delete</button>
        </div>
        <label class="field tl-title"><span>Title</span>
          <input type="text" value={list.title} maxLength={LIMITS.title} onInput={(e) => update({ title: (e.target as HTMLInputElement).value })} />
        </label>
        <div class="row">
          <button class="primary" onClick={() => void share()}>Copy share link</button>
          <ImageButton list={list} byId={byId} />
          <button onClick={exportFile}>Export file</button>
          <label class="btn">Import file<input type="file" accept="application/json,.json" class="sr-only"
            onChange={(e) => { const el = e.target as HTMLInputElement; const f = el.files?.[0]; if (f) void importFile(f); el.value = ""; }} /></label>
        </div>
        {link && (
          <div class="tl-link">
            <input type="text" readOnly value={link} aria-label="Share link" onFocus={(e) => (e.target as HTMLInputElement).select()} />
            <small class="muted">{link.length.toLocaleString()} characters. The list is in the link itself: change the list and copy a new one.</small>
          </div>
        )}
      </section>

      <div class="tl-board">
        {list.tiers.map((t, i) => (
          <section key={i} class={`tl-row${drop?.c === i ? " drop-on" : ""}${sel ? " can-take" : ""}`} style={{ "--tc": `var(--${t.color})` }}>
            <div class={`tl-label${t.color === "surface-3" ? " plain" : ""}`}>
              <button type="button" class="tl-name" aria-expanded={!sel ? editing === i : undefined}
                aria-label={sel ? `Move ${name(sel)} to ${t.name || "this tier"}` : `Edit tier ${t.name}`} title={sel ? "Move here" : "Rename, recolour or add a note"}
                onClick={() => (sel ? moveSel(i) : setEditing(editing === i ? null : i))}>
                <span>{t.name || "–"}</span>
                <small aria-hidden="true">{sel ? "Move here" : "Edit"}</small>
              </button>
            </div>
            <div class="tl-zone" data-drop={i} onClick={(e) => { if (sel && !(e.target as Element).closest(".tl-op")) moveSel(i); }}>
              <div class="tl-ops" role="group" aria-label={`${t.name}: ${rows[i].length} operators`}>
                {withMark(i, rows[i])}
                {!rows[i].length && !(drop?.c === i) && <span class="tl-empty">{sel ? "Tap to move here" : "Drag operators here"}</span>}
              </div>
              {t.note && <p class="tl-note">{t.note}</p>}
            </div>
            {editing === i && !sel && (
              <div class="tl-edit">
                <label class="field"><span>Name</span>
                  <input type="text" value={t.name} maxLength={LIMITS.name} onInput={(e) => setTier(i, { name: (e.target as HTMLInputElement).value })} />
                </label>
                <div class="field"><span>Colour</span>
                  <div class="tl-swatches" role="group" aria-label="Colour">
                    {COLORS.map((c) => (
                      <button key={c} type="button" class={`tl-swatch${c === "surface-3" ? " plain" : ""}`} style={{ "--tc": `var(--${c})` }} aria-pressed={t.color === c}
                        aria-label={COLOR_NAMES[c]} title={COLOR_NAMES[c]} onClick={() => setTier(i, { color: c })} />
                    ))}
                  </div>
                </div>
                <label class="field grow"><span>Note</span>
                  <input type="text" value={t.note} maxLength={LIMITS.note} placeholder="One line under the tier (optional)" onInput={(e) => setTier(i, { note: (e.target as HTMLInputElement).value })} />
                </label>
                <div class="row">
                  <button class="small" disabled={i === 0} onClick={() => swap(i, i - 1)}>Move up</button>
                  <button class="small" disabled={i === list.tiers.length - 1} onClick={() => swap(i, i + 1)}>Move down</button>
                  <button class="small ghost" onClick={() => removeTier(i)}>Remove tier</button>
                  <button class="small primary" onClick={() => setEditing(null)}>Done</button>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      {list.tiers.length < LIMITS.tiers && (
        <button class="ghost" onClick={() => { update({ tiers: [...list.tiers, nextTier(list.tiers)] }); setEditing(list.tiers.length); }}>+ Add a tier</button>
      )}

      <section class={`card tl-pool-card${drop?.c === -1 ? " drop-on" : ""}`}>
        <div class="card-head"><h2>Unranked <small class="muted">{pool.length}</small></h2></div>
        <div class="row">
          <input type="search" value={q} placeholder="Find an operator…" aria-label="Find an operator" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <label class="row tight"><input type="checkbox" checked={list.roster} disabled={!hasRoster.value && !list.roster}
            onChange={(e) => update({ roster: (e.target as HTMLInputElement).checked })} /> Only operators I own</label>
        </div>
        <OpFilters classes owned={false} />
        <div class="tl-zone tl-pool" data-drop={-1} onClick={(e) => { if (sel && placed.has(sel) && !(e.target as Element).closest(".tl-op")) moveSel(-1); }}>
          <div class="tl-ops" role="group" aria-label={`Unranked: ${pool.length} operators`}>
            {pool.map((id, i) => chip(id, last, i))}
            {!pool.length && <span class="tl-empty">{list.roster && !hasRoster.value ? <>Your roster is empty. <a href={href("/roster")}>Add your operators</a> or untick Only operators I own.</> : q || filters.active ? "No unranked operators match." : "Everyone is ranked."}</span>}
          </div>
        </div>
      </section>

      <Explain>Drag operators into tiers, or tap one and then tap a tier (on a phone, press and hold to drag). With a keyboard: Tab to an operator, Enter picks it up, the arrow keys move it between and within tiers, Enter puts it down, Delete sends it back to unranked. Tap a tier's name to rename or recolour it. Your lists are kept in this browser; a share link carries the whole list in the address, so nothing is uploaded.</Explain>
      <p id="tl-keys" class="sr-only">Enter picks it up, arrow keys move it, Enter puts it down. Delete sends it back to unranked.</p>
      <p class="sr-only" aria-live="polite">{say}</p>

      {sel && byId.get(sel) && (
        <div class="tl-selbar card" role="region" aria-label="Move the picked operator">
          <span class="tl-selname"><Avatar op={byId.get(sel)!} size="sm" /><strong>{name(sel)}</strong></span>
          <span class="tl-selmoves">
            {list.tiers.map((t, i) => <button key={i} class="small" style={{ "--tc": `var(--${t.color})` }} onClick={() => moveSel(i)}>{t.name || "–"}</button>)}
            {placed.has(sel) && <button class="small" onClick={() => moveSel(-1)}>Unranked</button>}
          </span>
          {placed.has(sel) && (() => {
            const g = tierOf(list, sel), i = rows[g]?.indexOf(sel) ?? -1;
            return (
              <span class="row tight">
                <button class="small" aria-label="Move left" disabled={i <= 0} onClick={() => move(sel, g, i - 1)}>◀</button>
                <button class="small" aria-label="Move right" disabled={i < 0 || i >= rows[g].length - 1} onClick={() => move(sel, g, i + 1)}>▶</button>
              </span>
            );
          })()}
          <button class="small ghost" onClick={() => { refocus.current = sel; setSel(null); }}>Done</button>
        </div>
      )}
    </>
  );
}
