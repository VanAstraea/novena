// Small confirmations in the corner: they stack, leave by themselves, and can carry one link ("See the plan") or one
// action ("Undo").
import { signal } from "@preact/signals";

interface Toast { id: number; text: string; link?: { href: string; label: string }; action?: { label: string; run: () => void }; kind: "good" | "bad" }
const toasts = signal<Toast[]>([]);
let next = 1;

export function toast(text: string, opts: { link?: Toast["link"]; action?: Toast["action"]; kind?: Toast["kind"]; seconds?: number } = {}): void {
  const t: Toast = { id: next++, text, link: opts.link, action: opts.action, kind: opts.kind || "good" };
  toasts.value = [...toasts.value.slice(-3), t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), (opts.seconds || 5) * 1000);
}

export function Toasts() {
  if (!toasts.value.length) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.link && <a href={t.link.href}>{t.link.label}</a>}
          {t.action && <button class="small" onClick={() => { t.action!.run(); toasts.value = toasts.value.filter((x) => x.id !== t.id); }}>{t.action.label}</button>}
          <button class="ghost small" aria-label="Dismiss" onClick={() => (toasts.value = toasts.value.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}

/** A change that can be taken back for a few seconds. */
export function undoable(text: string, undo: () => void, seconds = 8): void {
  toast(text, { action: { label: "Undo", run: () => { undo(); toast("Undone."); } }, seconds });
}
