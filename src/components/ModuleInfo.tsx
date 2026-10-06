// What a module does, wherever its icon appears: hover or focus the icon (tap it on a touch screen) for a card with
// the module's name and type and what each stage changes, plus a link to all the operator's modules. One card at a
// time, drawn over the page (never inside a clipped card or table) so it moves nothing.
import { signal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { art, operator } from "../lib/data";
import { placePopover, stageChanges, stageSummary } from "../lib/modules";
import { href, route } from "../lib/router";
import { server } from "../state";
import type { OpDetail } from "../types";
import { GIcon, Rich } from "./ui";

const POP_ID = "module-info";

/** Operator details already loaded, so a card opens at once the second time (data.ts also keeps the request). */
const loaded = new Map<string, OpDetail>();

/** An operator's detail file, loaded when first asked for. */
export function useModuleDetail(id: string): { d?: OpDetail; failed: boolean } {
  const s = server.value, key = `${s}/${id}`;
  const [, redraw] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (loaded.has(key)) return;
    let live = true;
    setFailed(false);
    operator(s, id).then((d) => { loaded.set(key, d); if (live) redraw((n) => n + 1); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [key]);
  return { d: loaded.get(key), failed };
}

/** The card: the module's name and type, then each stage's stats, trait change and talent upgrade, `hl` stressed. */
export function ModuleCard({ id, k, hl, hint }: { id: string; k: string; hl?: number; hint?: string }) {
  const { d, failed } = useModuleDetail(id);
  const all = <a class="modinfo-all" href={href(`/operator/${id}`, { tab: "modules" })}>All modules</a>;
  if (!d) return <div class="modinfo-body">{failed ? <p>Couldn't load module {k} just now. {all}</p> : <p class="muted">Loading module {k}…</p>}</div>;
  const m = d.modules.find((x) => x.letter === k);
  if (!m) return <div class="modinfo-body"><p>No details for module {k} on this server yet.</p>{all}</div>;
  return (
    <div class="modinfo-body">
      <div class="modinfo-head">
        <GIcon src={art.moduleType(m.type || m.icon.toLowerCase())} alt={m.icon} size={30} />
        <div><strong>{m.icon} · {m.name}</strong><small>Unlocks at E{m.unlock.elite} Lv {m.unlock.level}</small></div>
      </div>
      <ol class="modinfo-stages">
        {stageChanges(m).map((c) => (
          <li key={c.n} class={c.n === hl ? "on" : undefined} aria-current={c.n === hl ? "step" : undefined}>
            <div class="modinfo-st"><b>Stage {c.n}</b>{c.stats && <span>{c.stats}</span>}</div>
            {c.trait.map((t, i) => <p key={i}><span class="lbl">Trait</span> <Rich html={t} /></p>)}
            {c.talents.map((t, i) => <p key={`t${i}`}><span class="lbl">{t.name}</span> <Rich html={t.desc} /></p>)}
          </li>
        ))}
      </ol>
      <div class="modinfo-foot">{all}{hint && <small>{hint}</small>}</div>
    </div>
  );
}

/** One line on what a module gives at a stage, for lists with room for words (the operator panel's next upgrades). */
export function ModuleLine({ id, k, stage }: { id: string; k: string; stage: number }) {
  const { d, failed } = useModuleDetail(id);
  const m = d?.modules.find((x) => x.letter === k);
  if (!m) return d || failed ? null : <span class="muted">Loading…</span>;
  const text = stageSummary(m, stage);
  return <span class="mod-line" title={text}><strong>{m.icon} · {m.name}</strong><span class="muted">{text}</span></span>;
}

// --- the popover ---------------------------------------------------------------------------------------------------

interface Open { id: string; k: string; anchor: HTMLElement; pinned: boolean }
const open = signal<Open | null>(null);
let showT = 0, hideT = 0, quiet = false;

const pop = () => document.getElementById(POP_ID);
const focusVisible = (el: Element) => { try { return el.matches(":focus-visible"); } catch { return true; } };
const of = (el: HTMLElement, pinned: boolean): Open => ({ id: el.dataset.op!, k: el.dataset.mod!, anchor: el, pinned });

function show(o: Open) {
  clearTimeout(showT);
  clearTimeout(hideT);
  open.value = o;
}

/** Close the card; `refocus` puts focus back on the icon that opened it (Escape, or leaving the card by Tab). */
export function closeModuleInfo(refocus = false) {
  clearTimeout(showT);
  clearTimeout(hideT);
  const o = open.value;
  if (!o) return;
  open.value = null;
  if (refocus && o.anchor.isConnected) { quiet = true; o.anchor.focus(); quiet = false; }
}

function hideSoon() {
  clearTimeout(hideT);
  if (!open.value || open.value.pinned) return;
  hideT = window.setTimeout(() => {
    const o = open.value, active = document.activeElement;
    if (!o || o.pinned || pop()?.contains(active) || (active === o.anchor && focusVisible(o.anchor))) return;
    open.value = null;
  }, 180);
}

/** Props that make an element open a module's card. A mouse hovering it or a keyboard focusing it shows the card;
 *  with `click` (the default) a click or tap pins it open, without reaching a link or row around the element. Without
 *  `click` (the element already does something when clicked) only hover and focus show it, and `hint` says what a
 *  click does. `stage` is the stage the card stresses; it follows the element as it changes. */
export function moduleInfoProps(id: string, k: string, stage: number, click = true, hint?: string) {
  return {
    "data-op": id, "data-mod": k, "data-hl": stage, "data-hint": hint,
    ...(click ? { "aria-haspopup": "dialog" as const, "aria-expanded": false, "aria-controls": POP_ID } : {}),
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget as HTMLElement;
      clearTimeout(hideT);
      if (open.value?.pinned || open.value?.anchor === el) return;
      clearTimeout(showT);
      showT = window.setTimeout(() => show(of(el, false)), open.value ? 60 : 280);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(showT);
      hideSoon();
    },
    onFocus: (e: FocusEvent) => {
      const el = e.currentTarget as HTMLElement;
      if (quiet || open.value?.pinned || !focusVisible(el)) return;
      show(of(el, false));
    },
    onBlur: (e: FocusEvent) => {
      const o = open.value, to = e.relatedTarget as Node | null;
      if (o?.anchor === e.currentTarget && to && !pop()?.contains(to)) closeModuleInfo();
      else if (o?.anchor === e.currentTarget && !to) hideSoon();
    },
    ...(click ? {
      onClick: (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement, o = open.value;
        if (o?.anchor !== el) show(of(el, true));
        else if (o.pinned) closeModuleInfo();
        else open.value = { ...o, pinned: true };
      },
    } : {}),
  };
}

/** A small "i" that opens a module's card by tap, where tapping the icon itself does something else (the roster's
 *  edit mode). Shown only on touch screens; elsewhere hovering or focusing the icon does it. */
export function ModuleInfoButton({ id, k, stage }: { id: string; k: string; stage: number }) {
  return <button type="button" class="mod-i" aria-label={`What module ${k} does`} {...moduleInfoProps(id, k, stage)}><span aria-hidden="true">i</span></button>;
}

/** The one card on screen, beside the icon that opened it: below it when there's room, else above; kept inside the
 *  window and following the icon as the page scrolls. Escape, a tap outside or leaving the page closes it. */
export function ModuleInfoLayer() {
  const o = open.value;
  const ref = useRef<HTMLDivElement>(null);
  const [hl, setHl] = useState(0);
  const [hint, setHint] = useState<string | undefined>();
  const path = route.value;
  useEffect(() => closeModuleInfo(), [path]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!o || !el) return;
    const a = o.anchor;
    const popup = a.hasAttribute("aria-haspopup");
    a.setAttribute(popup ? "aria-expanded" : "aria-describedby", popup ? "true" : POP_ID);
    const read = () => { setHl(+(a.dataset.hl || 0)); setHint(a.dataset.hint || undefined); };
    read();
    const watch = new MutationObserver(read);
    watch.observe(a, { attributes: true, attributeFilter: ["data-hl", "data-hint"] });
    const place = () => {
      if (!a.isConnected) return closeModuleInfo();
      const h = el.scrollHeight + el.offsetHeight - el.clientHeight; // its full height, even while capped
      const nav = document.querySelector(".bottom-nav"); // phones: keep clear of the bar at the bottom
      const floor = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight;
      const p = placePopover(a.getBoundingClientRect(), { w: el.offsetWidth, h }, { w: document.documentElement.clientWidth, h: floor });
      Object.assign(el.style, { top: `${p.top}px`, left: `${p.left}px`, maxHeight: `${p.maxH}px`, visibility: "visible" });
      el.dataset.side = p.above ? "above" : "below";
    };
    place();
    const sized = new ResizeObserver(place); // the card grows when its operator's details arrive
    sized.observe(el);
    let raf = 0;
    const onMove = (e: Event) => {
      if (e.type === "scroll" && el.contains(e.target as Node)) return; // scrolling the card itself
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const onDown = (e: PointerEvent) => { if (!el.contains(e.target as Node) && !a.contains(e.target as Node)) closeModuleInfo(); };
    const onKey = (e: KeyboardEvent) => {
      const inside = el.contains(document.activeElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // the card closes, not the operator panel under it
        closeModuleInfo(true);
      } else if (e.key === "Tab" && o.pinned && !e.shiftKey && document.activeElement === a) {
        const link = el.querySelector("a");
        if (link) { e.preventDefault(); link.focus(); }
      } else if (e.key === "Tab" && inside) {
        e.preventDefault();
        closeModuleInfo(true);
      }
    };
    addEventListener("scroll", onMove, true);
    addEventListener("resize", onMove);
    document.addEventListener("pointerdown", onDown, true);
    addEventListener("keydown", onKey, true);
    return () => {
      if (popup) a.setAttribute("aria-expanded", "false");
      else a.removeAttribute("aria-describedby");
      watch.disconnect();
      sized.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onMove, true);
      removeEventListener("resize", onMove);
      document.removeEventListener("pointerdown", onDown, true);
      removeEventListener("keydown", onKey, true);
    };
  }, [o]);
  if (!o) return null;
  return (
    <div id={POP_ID} ref={ref} class="modinfo" role="dialog" aria-label={`Module ${o.k}`} tabIndex={-1} style={{ visibility: "hidden" }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") clearTimeout(hideT); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hideSoon(); }}
      onFocusOut={(e) => { const to = e.relatedTarget as Node | null; if (to && !ref.current?.contains(to) && to !== o.anchor) closeModuleInfo(); }}>
      <ModuleCard key={`${o.id}/${o.k}`} id={o.id} k={o.k} hl={hl} hint={hint} />
    </div>
  );
}
