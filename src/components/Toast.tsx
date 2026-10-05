// Small confirmations in the corner: they stack, leave by themselves, and can carry one link ("See the plan").
import { signal } from "@preact/signals";

interface Toast { id: number; text: string; link?: { href: string; label: string }; kind: "good" | "bad" }
const toasts = signal<Toast[]>([]);
let next = 1;

export function toast(text: string, opts: { link?: Toast["link"]; kind?: Toast["kind"]; seconds?: number } = {}): void {
  const t: Toast = { id: next++, text, link: opts.link, kind: opts.kind || "good" };
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
          <button class="ghost small" aria-label="Dismiss" onClick={() => (toasts.value = toasts.value.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
