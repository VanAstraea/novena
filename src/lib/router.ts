// A small history router. URLs are real paths under the site's base (`/compare?ops=...`), so every view can be
// shared. GitHub Pages serves 404.html (a copy of index.html) for deep links, and this picks the path up from there.
import { signal } from "@preact/signals";
import { BASE } from "./data";

export interface Route {
  path: string; // without the base, always starting with "/"
  query: URLSearchParams;
}

function current(): Route {
  let path = location.pathname;
  if (path.startsWith(BASE)) path = "/" + path.slice(BASE.length);
  path = path.replace(/\/+$/, "") || "/";
  return { path, query: new URLSearchParams(location.search) };
}

export const route = signal<Route>(current());

export function href(path: string, query?: Record<string, string | number | undefined | null> | URLSearchParams): string {
  const q = query instanceof URLSearchParams ? query : new URLSearchParams(
    Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]),
  );
  const s = q.toString();
  return BASE + path.replace(/^\//, "") + (s ? `?${s}` : "");
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  route.value = current();
  if (!opts.replace) window.scrollTo(0, 0);
}

/** Replace the query string of the current page without adding a history entry (filters, pickers). */
export function setQuery(params: Record<string, string | number | undefined | null>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  navigate(href(route.value.path, q), { replace: true });
}

window.addEventListener("popstate", () => (route.value = current()));

// Same-origin <a> clicks become client-side navigations.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.("a");
  if (!a || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (!a.pathname.startsWith(BASE.replace(/\/$/, "")) || /\.\w+$/.test(a.pathname)) return;
  e.preventDefault();
  navigate(a.pathname + a.search + a.hash);
});
