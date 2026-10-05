import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { effect } from "@preact/signals";
import { OperatorPanel } from "./components/OperatorPanel";
import { SearchDialog, searchOpen } from "./components/Search";
import { Toasts } from "./components/Toast";
import { loadShared, useAsync } from "./components/ui";
import { BASE, manifest } from "./lib/data";
import { date, relative } from "./lib/format";
import { pref, setPref } from "./lib/storage";
import { href, route } from "./lib/router";
import { match, PAGES } from "./pages/registry";
import { account, hasRoster, SERVERS, server, targets, theme, type Theme } from "./state";
import type { Server } from "./types";
import { SUPPORT } from "./config";

effect(() => {
  void server.value;
  loadShared();
});

const STALE_DAYS = 3;

/** The Novena mark: a faceted star pierced by a halo. */
export function Logo({ size = 30 }: { size?: number }) {
  return <img src={`${BASE}novena-mark.svg`} width={size} height={size} alt="" />;
}

function Header() {
  const path = route.value.path;
  const accountPaths = PAGES.filter((p) => p.nav === "account").map((p) => p.path);
  const inAccount = accountPaths.includes(path);
  const cycleTheme = () => {
    const order: Theme[] = ["system", "dark", "light"];
    theme.value = order[(order.indexOf(theme.value) + 1) % order.length];
  };
  return (
    <header class="top">
      <div class="top-row">
        <a class="brand" href={href("/")} aria-label="Novena home"><Logo /><span class="brand-name">Novena</span></a>
        <nav class="nav" aria-label="Main">
          {PAGES.filter((p) => p.nav === "main").map((p) => (
            <a key={p.path} href={href(p.path)} aria-current={path === p.path || (p.path === "/operators" && path.startsWith("/operator/")) ? "page" : undefined}>
              {p.short || p.title}
            </a>
          ))}
          <a href={href("/today")} aria-current={inAccount ? "page" : undefined}>My account</a>
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

function AccountStrip() {
  const path = route.value.path;
  const pages = PAGES.filter((p) => p.nav === "account");
  if (!pages.some((p) => p.path === path)) return null;
  return (
    <div class="account-strip">
      <nav class="tabs" aria-label="My account pages">
        {pages.map((p) => (
          <a key={p.path} href={href(p.path)} aria-current={p.path === path ? "page" : undefined}>{p.short || p.title}</a>
        ))}
        {hasRoster.value && (
          <span class={`updated${Date.now() - account.value.updated > 2 * DAY ? " warn-text" : ""}`} title="When your roster last changed here">
            Roster {account.value.source === "novena-sync" ? "synced" : "updated"} {relative(account.value.updated)}
          </span>
        )}
      </nav>
      <GetStarted />
    </div>
  );
}

const DAY = 86400_000;

/** First visit to the account pages: three steps to a first plan, ticked off as they're done. */
function GetStarted() {
  const [hidden, setHidden] = useState(() => pref("getStartedHidden", "") === "1");
  const steps: [boolean, string, string, string][] = [
    [hasRoster.value, "Add your operators", "/roster?tab=import", "Sync, import a file, or add them by hand"],
    [Object.keys(account.value.depot).length > 0, "Add your depot", "/roster?tab=depot", "From screenshots of your in-game Depot"],
    [targets.value.length > 0, "Set a goal", "/planner", "Type a build in the planner, or press Make it a goal on any operator"],
  ];
  if (hidden || steps.every(([done]) => done)) return null;
  return (
    <section class="card get-started">
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Three steps to your first plan</h2>
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
        <p><strong>Your data stays in this browser.</strong> No accounts, no tracking, no analytics. <a href={href("/settings")}>Back up or delete it</a>.</p>
        <p>
          Data: game tables via <a href="https://github.com/ArknightsAssets/ArknightsGamedata" rel="noopener">ArknightsAssets</a>,
          drop rates from <a href="https://penguin-stats.io/" rel="noopener">Penguin Statistics</a> (CC BY-NC 4.0),
          material values and operator statistics from <a href="https://ark.yituliu.cn/" rel="noopener">Yituliu</a>,
          clear guides from the <a href="https://prts.plus/" rel="noopener">MAA Copilot</a> guide database, base and IS data from <a href="https://github.com/MaaAssistantArknights/MaaAssistantArknights" rel="noopener">MAA</a>'s resource files.
          Images from <a href="https://github.com/yuanyan3060/ArknightsGameResource" rel="noopener">ArknightsGameResource</a> and <a href="https://github.com/ArknightsAssets/ArknightsAssets2" rel="noopener">ArknightsAssets2</a>. <a href={href("/credits")}>Full credits and licenses</a>.
        </p>
        <p>Unofficial fan tool. Not affiliated with Hypergryph, Yostar or Gryphline. Arknights and all game assets belong to their owners. Code: MIT.
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
      <AccountStrip />
      <StaleBanner />
      <main id="main" tabIndex={-1}>
        <Page key={server.value} />
      </main>
      <Footer />
      <SearchDialog />
      <OperatorPanel />
      <Toasts />
    </>
  );
}
