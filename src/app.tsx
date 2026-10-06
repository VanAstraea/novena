import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { effect } from "@preact/signals";
import { ModuleInfoLayer } from "./components/ModuleInfo";
import { OperatorPanel } from "./components/OperatorPanel";
import { SearchDialog, searchOpen } from "./components/Search";
import { Toasts } from "./components/Toast";
import { loadShared, useAsync, useTabGlide } from "./components/ui";
import { BASE, manifest } from "./lib/data";
import { date, relative } from "./lib/format";
import { pref, setPref } from "./lib/storage";
import { clearSample } from "./lib/accountImport";
import { watchTimers } from "./lib/timers";
import { href, navigate, route } from "./lib/router";
import { match, PAGES, SECTIONS } from "./pages/registry";
import { account, hasRoster, SERVERS, server, targets, theme, type Theme } from "./state";
import type { Server } from "./types";
import { SUPPORT } from "./config";

effect(() => {
  void server.value;
  loadShared();
});
watchTimers(); // once: it follows the account and server by itself

const STALE_DAYS = 3;

/** The Novena mark: a faceted star pierced by a halo. */
export function Logo({ size = 30 }: { size?: number }) {
  return <img src={`${BASE}novena-mark.svg`} width={size} height={size} alt="" />;
}

function Header() {
  const path = route.value.path;
  const section = match(path)?.page.group;
  const cycleTheme = () => {
    const order: Theme[] = ["system", "dark", "light"];
    theme.value = order[(order.indexOf(theme.value) + 1) % order.length];
  };
  return (
    <header class="top">
      <div class="top-row">
        <a class="brand" href={href("/")} aria-label="Novena home"><Logo /><span class="brand-name">Novena</span></a>
        <nav class="nav" aria-label="Main">
          {SECTIONS.map((g) => (
            <a key={g.id} class={g.id === "account" ? "nav-account" : undefined} href={href(g.home)} aria-current={section === g.id ? "page" : undefined}>{g.label}</a>
          ))}
        </nav>
        <div class="top-actions">
          <button class="searchpill" onClick={() => (searchOpen.value = true)} aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 L 16 16" /></svg>
            <span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <label class="sr-only" for="server-select">Server</label>
          <select id="server-select" value={server.value} onChange={(e) => (server.value = (e.target as HTMLSelectElement).value as Server)}
            title="Game server: names, availability, drop rates and dates follow it">
            {SERVERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button class="ghost" onClick={cycleTheme} aria-label={`Theme: ${theme.value}`} title={`Theme: ${theme.value} (click to change)`}>
            <span aria-hidden="true">{theme.value === "light" ? "☀" : theme.value === "dark" ? "☾" : "◐"}</span>
          </button>
          <a class="btn ghost" href={href("/settings")} aria-label="Settings and backup" title="Settings and backup"><span aria-hidden="true">⚙</span></a>
        </div>
      </div>
    </header>
  );
}

/** The strip under the header: the current section's pages (My account also shows when the roster last changed). */
function SectionStrip() {
  const path = route.value.path;
  const section = match(path)?.page.group;
  const pages = PAGES.filter((p) => p.group && p.group === section && p.nav);
  const bar = useTabGlide(path);
  if (pages.length < 2) return null;
  const account_ = section === "account";
  return (
    <div class="account-strip">
      <nav class="tabs" aria-label={`${SECTIONS.find((g) => g.id === section)?.label} pages`} ref={bar as never}>
        {pages.map((p) => (
          <a key={p.path} href={href(p.path)} aria-current={p.path === path || (p.path === "/operators" && path.startsWith("/operator/")) ? "page" : undefined}>{p.short || p.title}</a>
        ))}
        <span class="tab-glide" aria-hidden="true" />
        {account_ && hasRoster.value && (
          <a class={`updated${Date.now() - account.value.updated > 2 * DAY ? " warn-text" : ""}`} href={href("/roster", { tab: "import" })} title="Sync again or import a newer file">
            Roster {account.value.source === "novena-sync" ? "synced" : "updated"} {relative(account.value.updated)} · <span class="u">Sync</span>
          </a>
        )}
      </nav>
      {account_ && (path === "/today" || path === "/roster") && <GetStarted />}
    </div>
  );
}

const DAY = 86400_000;

/** On Today and Roster until it's done: three steps to a first plan, ticked off as they're done; gone once all three are. */
function GetStarted() {
  const [hidden, setHidden] = useState(() => pref("getStartedHidden", "") === "1");
  const steps: [boolean, string, string, string][] = [
    [hasRoster.value, "Add your operators", "/roster?tab=import", "Sync, import a file, or add them by hand"],
    [Object.keys(account.value.depot).length > 0, "Add your depot", "/roster?tab=depot", "From screenshots of your in-game Depot, or from Krooster or Penguin Statistics"],
    [targets.value.length > 0, "Set a goal", "/planner", "Type a build in the planner, or press Make it a goal on any operator"],
  ];
  if (hidden || steps.every(([done]) => done)) return null;
  return (
    <section class="card get-started">
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Three steps to get started</h2>
        <button class="ghost small" onClick={() => { setPref("getStartedHidden", "1"); setHidden(true); }}>Hide</button>
      </div>
      <ol>
        {steps.map(([done, title, to, note]) => {
          const [path, query] = to.split("?");
          return (
            <li key={title} class={done ? "done" : ""}>
              <span class="tick" aria-hidden="true">{done ? "✓" : ""}</span>
              <span><a href={href(path, new URLSearchParams(query || ""))}>{title}</a><br /><small class="muted">{note}</small></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** While the sample roster is in use: say so on every page, with the way to your own. */
function SampleBanner() {
  if (account.value.source !== "sample") return null;
  return (
    <div class="banner sample-banner" role="status">
      <div><strong>You're exploring a sample roster.</strong> Everything here is made up, to show what Novena does.</div>
      <div class="row tight">
        <a class="btn small primary" href={href("/roster", { tab: "import" })}>Bring your own</a>
        <button class="small ghost" onClick={() => { clearSample(); navigate(href("/")); }}>Clear the sample</button>
      </div>
    </div>
  );
}

/** Phones: the sections in a bar at the bottom of the screen, within reach of a thumb (the top row hides there). */
const SECTION_ICON: Record<string, string> = {
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  operators: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5m2 9a6 6 0 0 0-3-5.2",
  farming: "M12 21V11m0 0c0-4 3-7 7-7 0 4-3 7-7 7Zm0 3c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5Z",
  recruit: "M4 8h16M4 8l2-4h12l2 4M4 8v11h16V8M9 13h6",
  upcoming: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  is: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
};

function BottomNav() {
  const section = match(route.value.path)?.page.group;
  return (
    <nav class="bottom-nav" aria-label="Sections">
      {SECTIONS.map((g) => (
        <a key={g.id} href={href(g.home)} aria-current={section === g.id ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={SECTION_ICON[g.id]} /></svg>
          <span>{g.id === "account" ? "Account" : g.label}</span>
        </a>
      ))}
    </nav>
  );
}

function StaleBanner() {
  const m = useAsync(manifest, []);
  if (!m.data) return null;
  const age = (Date.now() - m.data.built) / 86400_000;
  if (age < STALE_DAYS) return null;
  return (
    <div class="banner" role="status">
      <div>The data was last updated {Math.floor(age)} days ago ({date(m.data.built)}). The daily update may be failing; numbers may be out of date.</div>
    </div>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="footer-inner">
        <p><strong>Your data stays in this browser.</strong> No accounts, no tracking. <a href={href("/settings")}>Back up or delete it</a>.
          {" "}Data from ArknightsAssets, Penguin Statistics, Yituliu and MAA; art from community mirrors. <a href={href("/credits")}>Credits and licenses</a>.</p>
        <p class="muted">Unofficial fan tool. Not affiliated with Hypergryph, Yostar or Gryphline. Arknights and its assets belong to their owners. Code: MIT.
          {SUPPORT.length > 0 && <> · <a href={href("/about") + "#support"}>Support the project</a></>}</p>
      </div>
    </footer>
  );
}

const cache = new Map<string, ComponentType<{ params: Record<string, string> }>>();

function Page() {
  const r = route.value;
  const m = match(r.path);
  const [, force] = useState(0);
  const key = m?.page.path || "404";
  const Comp = cache.get(key);
  useEffect(() => {
    if (!m || cache.has(key)) return;
    m.page.load().then((mod) => { cache.set(key, mod.default); force((n) => n + 1); });
  }, [key]);
  useEffect(() => {
    document.title = m && m.page.path !== "/" ? `${m.page.title} · Novena` : "Novena · Arknights companion";
  }, [key]);
  if (!m) {
    return (
      <div class="card"><h1>Page not found</h1><p>There's nothing at this address. <a href={href("/")}>Go home</a>.</p></div>
    );
  }
  if (!Comp) return <p class="muted" role="status">Loading…</p>;
  return <Comp params={m.params} />;
}

export function App() {
  return (
    <>
      <a class="skip" href="#main">Skip to content</a>
      <Header />
      <SectionStrip />
      <SampleBanner />
      <StaleBanner />
      <main id="main" tabIndex={-1}>
        <Page key={server.value} />
      </main>
      <Footer />
      <BottomNav />
      <SearchDialog />
      <OperatorPanel />
      <ModuleInfoLayer />
      <Toasts />
    </>
  );
}
