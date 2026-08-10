// Working with no signal.
//
// This is the difference between a planner and a planner you can actually use.
// The places it is for are the Nullarbor, the Tanami, Cape York and the Gibb,
// and those are exactly the places with no bars on the phone. An app that needs
// a connection is useless standing at the five hundred and seventy kilometre
// fuel gap it warned you about last week.
//
// Three different jobs, three different rules, and the rules matter more than
// the caching does:
//
//   The app itself is cache first. It does not change between deploys, and
//   waiting on a network that is not there before showing a screen that has not
//   changed is how an app appears broken when it is fine.
//
//   The data is network first, falling back to what was kept. Fuel prices go
//   stale in hours, so a live answer always wins where there is one. But a
//   price from yesterday beats a spinner forever, and campsite locations from
//   last month are as good as today's.
//
//   Map tiles are cache first and capped. They never change, they are the
//   bulkiest thing here, and every one that is kept is a square of country you
//   can still look at tomorrow with no signal.
//
// Nothing is ever deleted for being old. Out there, old is all you have.

const VERSION = 'lapmap-v1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const TILES = `${VERSION}-tiles`;

// About four hundred megabytes of country at the zooms worth keeping. Phones
// evict whole caches when they are pushed, so this stays well short.
const TILE_CAP = 3000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Older versions go, current ones stay. A deploy should not cost somebody
    // the tiles they saved before leaving town.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isTile = (url) => url.hostname.endsWith('tile.openstreetmap.org');
const isData = (url) => url.pathname.startsWith('/api/');
const isShell = (url) =>
  url.origin === self.location.origin
  && (url.pathname === '/' || url.pathname.startsWith('/planner')
      || url.pathname.startsWith('/_next/static/'));

/** Keep the cache from growing without limit, oldest first. */
async function trim(name, cap) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= cap) return;
  for (const key of keys.slice(0, keys.length - cap)) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  if (isTile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        // Opaque responses are cross origin and cannot be inspected, but they
        // can be replayed, which is all a tile needs.
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(request, res.clone());
          trim(TILES, TILE_CAP);
        }
        return res;
      } catch {
        // No tile and no signal. Better an empty square than a broken map.
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  if (isData(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        const hit = await cache.match(request);
        if (hit) {
          // Marked, so the page can say the numbers are from last time rather
          // than presenting yesterday's fuel price as today's.
          const body = await hit.blob();
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': hit.headers.get('Content-Type') || 'application/json', 'X-From-Cache': '1' },
          });
        }
        return new Response(JSON.stringify({ offline: true }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }
    })());
    return;
  }

  if (isShell(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(request);
      // Served from the cache immediately, refreshed in the background, so the
      // next open has the newer one. Nobody waits for a network to see a screen
      // that has not changed.
      const live = fetch(request).then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await live) || new Response('Offline', { status: 503 });
    })());
  }
});

// Saving a run for later.
//
// The page hands over every tile and every data URL for the road ahead, and
// this walks them slowly enough not to choke the connection, reporting back as
// it goes. Deliberately not parallel: this is usually running on one bar of
// reception in a caravan park, and twenty at once gets nowhere.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'save-route') return;

  event.waitUntil((async () => {
    const urls = Array.isArray(msg.urls) ? msg.urls : [];
    const tiles = await caches.open(TILES);
    const data = await caches.open(DATA);
    let done = 0, failed = 0;

    for (const raw of urls) {
      try {
        const url = new URL(raw, self.location.origin);
        const cache = isTile(url) ? tiles : data;
        if (await cache.match(raw)) { done += 1; continue; }
        const res = await fetch(raw, isTile(url) ? { mode: 'no-cors' } : undefined);
        if (res && (res.ok || res.type === 'opaque')) { await cache.put(raw, res.clone()); done += 1; }
        else failed += 1;
      } catch { failed += 1; }

      if (done % 25 === 0) {
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: 'save-progress', done, failed, total: urls.length }));
      }
    }

    await trim(TILES, TILE_CAP);
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'save-done', done, failed, total: urls.length }));
  })());
});
