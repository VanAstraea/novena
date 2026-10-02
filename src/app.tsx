import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { effect } from "@preact/signals";
import { SearchDialog, searchOpen } from "./components/Search";
import { loadShared, useAsync } from "./components/ui";
import { manifest } from "./lib/data";
import { date } from "./lib/format";
import { href, route } from "./lib/router";
import { match, PAGES } from "./pages/registry";
import { SERVERS, server, theme, type Theme } from "./state";
import type { Server } from "./types";
import { SUPPORT } from "./config";

effect(() => {
  void server.value;
  loadShared();
});

const STALE_DAYS = 3;

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 30 16 16 30 2 16z" fill="var(--accent)" />
      <path d="M16 9 23 16 16 23 9 16z" fill="var(--bg)" />
    </svg>
  );
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
        <div class="top-actions">
          <button class="ghost" onClick={() => (searchOpen.value = true)} aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
            <span aria-hidden="true">⌕</span><span class="sr-only">Search</span>
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
      <nav class="nav" aria-label="Main">
        {PAGES.filter((p) => p.nav === "main").map((p) => (
          <a key={p.path} href={href(p.path)} aria-current={path === p.path || (p.path === "/operators" && path.startsWith("/operator/")) ? "page" : undefined}>
            {p.short || p.title}
          </a>
        ))}
        <a href={href("/roster")} aria-current={inAccount ? "page" : undefined}>My account</a>
      </nav>
    </header>
  );
}

function AccountStrip() {
  const path = route.value.path;
  const pages = PAGES.filter((p) => p.nav === "account");
  if (!pages.some((p) => p.path === path)) return null;
  return (
    <nav class="tabs" aria-label="My account pages" style={{ maxWidth: "1280px", margin: "8px auto 0", padding: "0 16px" }}>
      {pages.map((p) => (
        <a key={p.path} class="btn ghost" href={href(p.path)} aria-current={p.path === path ? "page" : undefined}
          style={{ borderBottom: p.path === path ? "2px solid var(--accent)" : "2px solid transparent", borderRadius: 0 }}>
          {p.short || p.title}
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
        <p><strong>Your data stays in this browser.</strong> No accounts, no tracking, no analytics. <a href={href("/settings")}>Back up or delete it</a>.</p>
        <p>
          Data: game tables via <a href="https://github.com/ArknightsAssets/ArknightsGamedata" rel="noopener">ArknightsAssets</a>,
          drop rates from <a href="https://penguin-stats.io/" rel="noopener">Penguin Statistics</a> (CC BY-NC 4.0),
          material values and operator statistics from <a href="https://ark.yituliu.cn/" rel="noopener">Yituliu</a>,
          clear guides from <a href="https://prts.plus/" rel="noopener">MAA Copilot</a>, IS and base data from <a href="https://github.com/MaaAssistantArknights/MaaAssistantArknights" rel="noopener">MAA</a>,
          images from <a href="https://github.com/yuanyan3060/ArknightsGameResource" rel="noopener">ArknightsGameResource</a>. <a href={href("/about")}>Full credits</a>.
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
    </>
  );
}
