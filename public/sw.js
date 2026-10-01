// Pack 361 service worker:
//  * push notifications (announcements, volunteer and training reminders)
//  * offline campout pages: campout pages are saved on the phone when opened, so the
//    schedule, rules and packing list still work at camp with no signal. Cleared on sign-out.
//  * the "Saved on this phone" page (/family/files), so a family's own saved forms open at
//    camp. Only the page itself is cached here; the files live in IndexedDB, which sign-out
//    and this worker never touch.
const CACHE = "pack361-offline-v1";
const OFFLINE_PAGES = /^\/(?:campouts\/[0-9a-f-]{36}|family\/files)\/?$/i;
const STATIC = /^\/(_next\/static\/|icon-|badge\.png|notification-badge\.png|apple-icon|icon\.png|favicon\.ico)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("pack361-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);

// ---------------------------------------------------------------------------
// Offline caching
// ---------------------------------------------------------------------------
async function trimStatic(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/_next/static/"));
  for (const r of keys.slice(0, Math.max(0, keys.length - 400))) await cache.delete(r);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trimStatic(cache);
  }
  return res;
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
      '<body style="font-family:system-ui,sans-serif;padding:32px;color:#1b1c19;background:#faf9f4">' +
      "<h1 style=\"color:#1b4332\">You're offline</h1><p>This page wasn't saved on this phone yet. " +
      "Campout pages and Saved on this phone work without signal once you've opened them.</p><p><a href=\"/campouts\" style=\"color:#1b4332\">Campouts</a> · " +
      "<a href=\"/family/files\" style=\"color:#1b4332\">Saved on this phone</a></p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = new URL(request.url).pathname;
  try {
    const res = await fetch(request);
    // Don't save sign-in redirects or errors
    if (res.ok && !res.redirected) await cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) || offlinePage();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (STATIC.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && OFFLINE_PAGES.test(url.pathname)) {
    event.respondWith(networkFirst(req));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear") {
    event.waitUntil(caches.delete(CACHE));
  } else if (data.type === "save" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        let ok = true;
        for (const u of data.urls.slice(0, 200)) {
          try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin) continue;
            const page = OFFLINE_PAGES.test(url.pathname);
            if (!page && !STATIC.test(url.pathname)) continue;
            if (!page && (await cache.match(url.pathname + url.search))) continue;
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok && !res.redirected) await cache.put(page ? url.pathname : url.href, res);
            else if (page) ok = false;
          } catch {
            ok = false;
          }
        }
        if (event.source) event.source.postMessage({ type: "saved", ok, at: Date.now() });
      })(),
    );
  }
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pack 361", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Pack 361";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/notification-badge.png",
      tag: data.tag || "pack361",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c && "navigate" in c) {
          // navigate() fails for a window this worker doesn't control (iOS home-screen app
          // opened before the worker took over); open the link in a new window instead.
          return c
            .focus()
            .then((w) => (w || c).navigate(url))
            .catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
