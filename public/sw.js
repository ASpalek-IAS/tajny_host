/*
 * Service worker – offline režim pro agenty.
 *
 * - Stránky agenta (/agent…) se při každém načtení s připojením uloží do zařízení
 *   (nejdřív síť, při výpadku uložená verze).
 * - Přiřazené kontroly se předem stáhnou, když agent otevře přehled „Moje kontroly“
 *   (zpráva "precache" ze stránky).
 * - Statické soubory aplikace (/_next/static – skripty, styly, písma) se ukládají
 *   natrvalo, mají v názvu otisk obsahu.
 * - Ostatní stránky (správce, klient) se neukládají.
 *
 * Při změně logiky zvyšte VERSION – staré mezipaměti se smažou.
 */
const VERSION = "v1";
const PAGES = `ms-pages-${VERSION}`;
const STATIC = `ms-static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ms-") && k !== PAGES && k !== STATIC).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isAgentPage = (url) => url.origin === self.location.origin && (url.pathname === "/agent" || url.pathname.startsWith("/agent/"));
const isStatic = (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
const pageKey = (url) => new Request(new URL(url.pathname, self.location.origin).toString());

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isStatic(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    if (isAgentPage(url)) event.respondWith(networkFirstPage(req, url));
    else if (url.origin === self.location.origin && url.pathname === "/") event.respondWith(rootFallback(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirstPage(req, url) {
  const hit = await (await caches.open(PAGES)).match(pageKey(url));
  const network = fetch(req).then((res) => {
    if (cacheable(res)) storePage(url, res.clone());
    return res;
  });
  network.catch(() => {});
  try {
    if (!hit) return await network;
    // slabý signál: když síť do 8 s neodpoví, ukážeme uloženou verzi (síť ji na pozadí aktualizuje)
    return await Promise.race([network, new Promise((r) => setTimeout(() => r(hit), 8000))]);
  } catch {
    return hit || offlinePage(url.pathname === "/agent" ? "Přehled kontrol" : "Tato kontrola");
  }
}

// Spuštění aplikace z plochy bez připojení – „/“ by jinak skončilo chybou prohlížeče
async function rootFallback(req) {
  try {
    return await fetch(req);
  } catch {
    const hit = await (await caches.open(PAGES)).match(pageKey(new URL("/agent", self.location.origin)));
    return hit || offlinePage("Aplikace");
  }
}

/** Uložit jen skutečnou stránku agenta – ne přesměrování na přihlášení. */
function cacheable(res) {
  if (!res.ok || res.type === "opaqueredirect") return false;
  if (res.redirected && !isAgentPage(new URL(res.url))) return false;
  return (res.headers.get("content-type") || "").includes("text/html");
}

async function storePage(url, res) {
  const html = await res.clone().text();
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url), res);
  await cacheAssets(html);
}

/** Stáhne skripty, styly a písma, na které stránka odkazuje, aby šla otevřít offline. */
async function cacheAssets(text) {
  const cache = await caches.open(STATIC);
  const found = new Set(text.match(/\/_next\/static\/[^"'()\s\\]+/g) || []);
  for (const path of found) {
    const req = new Request(new URL(path, self.location.origin).toString());
    if (await cache.match(req)) continue;
    try {
      const res = await fetch(req);
      if (!res.ok) continue;
      await cache.put(req, res.clone());
      // písma jsou odkázaná až ze stylů
      if (path.endsWith(".css")) await cacheAssets(await res.text());
    } catch {
      /* další pokus při příštím načtení */
    }
  }
}

/** Předstažení stránek (seznam kontrol + jednotlivé kontroly). */
async function precache(urls) {
  const cache = await caches.open(PAGES);
  let ok = 0;
  for (const u of urls) {
    const url = new URL(u, self.location.origin);
    if (!isAgentPage(url)) continue;
    try {
      const res = await fetch(url.toString(), { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!cacheable(res)) continue;
      await storePage(url, res);
      ok++;
    } catch {
      /* bez připojení – zůstane starší uložená verze */
    }
  }
  // kontroly, které agent už nemá k vyplnění, z mezipaměti odstranit
  const keep = new Set(urls.map((u) => new URL(u, self.location.origin).pathname));
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/agent/kontroly/") && !keep.has(p)) await cache.delete(req);
  }
  await pruneStatic();
  return ok;
}

/** Smaže statické soubory starých verzí aplikace, na které už žádná uložená stránka neodkazuje. */
async function pruneStatic() {
  const pages = await caches.open(PAGES);
  const used = new Set();
  for (const req of await pages.keys()) {
    const res = await pages.match(req);
    const html = res ? await res.text() : "";
    for (const m of html.match(/\/_next\/static\/[^"'()\s\\]+/g) || []) used.add(m);
  }
  if (used.size === 0) return;
  const stat = await caches.open(STATIC);
  for (const req of await stat.keys()) {
    const p = new URL(req.url).pathname;
    // písma a obrázky (media) necháváme – jsou malé a odkazují na ně styly
    if (!used.has(p) && !p.startsWith("/_next/static/media/")) await stat.delete(req);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const reply = (msg) => event.ports && event.ports[0] && event.ports[0].postMessage(msg);
  if (data.type === "precache") {
    event.waitUntil(precache(data.urls || []).then((ok) => reply({ ok })));
  } else if (data.type === "clear") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ms-pages")).map((k) => caches.delete(k))))
        .then(() => reply({ ok: true })),
    );
  }
});

function offlinePage(what) {
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><style>body{font-family:system-ui,sans-serif;background:#f7f6f3;color:#2b2926;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.c{max-width:360px;background:#fff;border:1px solid #e2e0db;border-radius:14px;padding:24px;text-align:center}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#5f5b54;line-height:1.5}
a{display:inline-block;margin-top:8px;color:#136f61;font-weight:600}</style></head><body><div class="c">
<h1>Jste offline</h1><p>${what} není uložená v tomto zařízení. Kontroly se do telefonu stáhnou, když otevřete přehled „Moje kontroly“ s připojením.</p>
<a href="/agent">Zkusit znovu</a></div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
