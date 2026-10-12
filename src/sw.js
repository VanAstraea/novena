// Novena's service worker: it only caches, so the site opens and works without a connection. It never sends anything
// anywhere and never touches requests to other sites (the game art from community mirrors is left to the browser).
// scripts/postbuild.mjs copies this file to dist/sw.js and fills in BUILD: the files of this build to keep ready
// (shell), every hashed file the build has (assets) and a version made from their contents. Not used in development.
//
//   app shell (index.html, scripts, styles, fonts, icons)   kept ready when installed; served from the cache
//   other build files (the solver's wasm, the screenshot reader)   cached the first time they're used
//   data files (data/v1/...)   the cached copy at once, refreshed in the background for next time
//   page addresses (/operator/..., /farming?...)   the cached app page, which routes in the browser
const BUILD = /* BUILD */ { version: "dev", shell: [], assets: [] };

const SHELL = `novena-shell-${BUILD.version}`; // replaced with each new version
const ASSETS = "novena-assets"; // kept across versions; files no build uses any more are dropped on activate
const DATA = "novena-data-v1"; // follows the data format version in the address
const KEEP = [SHELL, ASSETS, DATA];
const ROOT = new URL("./", self.location.href).href; // the site's base address, "/" or "/novena/"
const at = (path) => new URL(path, ROOT).href;
const shell = new Set(BUILD.shell.map(at));
const assets = new Set(BUILD.assets.map(at));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([...shell].map((u) => new Request(u, { cache: "reload" })))));
  // no skipWaiting here: a new version waits until the page asks for it (the "A new version is ready" toast)
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("novena-") && !KEEP.includes(name)) await caches.delete(name);
    }
    const c = await caches.open(ASSETS);
    for (const req of await c.keys()) if (!assets.has(req.url)) await c.delete(req);
    await self.clients.claim(); // the first install looks after the open page straight away
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(ROOT)) return; // other sites, and anything that isn't a plain read
  const url = new URL(req.url);
  url.hash = "";
  const bare = url.origin + url.pathname;

  if (req.mode === "navigate" && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    event.respondWith(caches.match(at("index.html"), { cacheName: SHELL }).then((r) => r || fetch(req)));
  } else if (bare.startsWith(at("data/"))) {
    event.respondWith(staleWhileRevalidate(event, req));
  } else if (shell.has(bare)) {
    event.respondWith(caches.match(bare, { cacheName: SHELL }).then((r) => r || fetch(req)));
  } else if (assets.has(bare)) {
    event.respondWith(cacheFirst(event, req, bare));
  }
  // anything else (og-image.png, notices, a file from a newer build): the browser handles it as usual
});

/** Hashed build files never change: the cached copy if there is one, otherwise fetch and keep it. */
async function cacheFirst(event, req, key) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) event.waitUntil(c.put(key, res.clone()).catch(() => {})); // the page gets it without waiting for the copy
  return res;
}

/** The cached copy straight away (when there is one), with a fresh copy fetched for next time. */
async function staleWhileRevalidate(event, req) {
  const c = await caches.open(DATA);
  const hit = await c.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await c.put(req.url.split(/[?#]/)[0], res.clone());
    return res;
  });
  if (!hit) return fresh;
  event.waitUntil(fresh.catch(() => {})); // offline: the cached copy is all there is
  return hit;
}
