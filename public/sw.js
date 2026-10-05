// Pack 361 service worker:
//  * push notifications (announcements, volunteer and training reminders)
//  * offline campout pages: campout pages are saved on the phone when opened, so the
//    schedule, rules and packing list still work at camp with no signal. Cleared on sign-out.
//  * the "Saved on this phone" page (/family/files), so a family's own saved forms open at
//    camp. Only the page itself is cached here; the files live in IndexedDB, which sign-out
//    and this worker never touch.
const CACHE = "pack361-offline-v3"; // v3: navigation preload, small header badge (2026-10-03)
// (The loading screen on a cold start, 2026-10-05, needs no new cache: it's built here.)
const OFFLINE_PAGES = /^\/(?:campouts\/[0-9a-f-]{36}|family\/files)\/?$/i;
// The opening video itself isn't cached here: phones ask for video in ranges, which a cached
// whole file can't answer (Safari then won't play it). The browser's own cache keeps it.
// Bird sound ID model files: kept in their own cache, so they work on the trail and survive
// sign-out (they hold no pack data). Each model version has its own folder and cache.
const BIRDNET = /^\/birdnet\/v2\.4\//;
const BIRDNET_CACHE = "birdnet-v2.4";
const STATIC = /^\/(_next\/static\/|icon-|splash-poster|badge\.png|badge-96\.png|notification-badge\.png|apple-icon|icon\.png|favicon\.ico)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Navigation preload: the page request starts while the worker boots, instead of after.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // not supported here
        }
      }
      for (const key of await caches.keys()) if (key.startsWith("pack361-") && key !== CACHE) await caches.delete(key);
      for (const key of await caches.keys()) if (key.startsWith("birdnet-") && key !== BIRDNET_CACHE) await caches.delete(key);
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

// Answers right away; saving the copy (and trimming old ones) finishes in the background.
async function cacheFirst(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(cache.put(request, copy).then(() => trimStatic(cache)).catch(() => {}));
  }
  return res;
}

// Bird model files: from the phone once saved, else downloaded and saved.
async function birdnetFirst(event) {
  const cache = await caches.open(BIRDNET_CACHE);
  const hit = await cache.match(event.request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok && res.status === 200) event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
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

async function networkFirst(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const key = new URL(request.url).pathname;
  try {
    // The preloaded response (started while the worker woke up), else a normal fetch.
    const res = (await event.preloadResponse) || (await fetch(request));
    // Don't save sign-in redirects or errors
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return res;
  } catch {
    return (await cache.match(key)) || offlinePage();
  }
}

// ---------------------------------------------------------------------------
// Loading screen on a cold start
// ---------------------------------------------------------------------------
// Opening the app from the home screen after a while, the server can take a few seconds to
// answer (it has to start up). The page's own loading screen (src/components/BootLoader.tsx) can
// only show once the first of the page arrives, so until then the phone shows a blank or splash
// screen. So when the app opens with no other window of it, and the page hasn't answered in a
// moment, this answers at once with a copy of the loading screen from the phone. That screen then
// moves on to the page with ?_b=1 added, and the phone keeps showing it until the page starts
// arriving. The page request already under way is kept and used for that (the extra ?_b=1
// request is answered empty by src/proxy.ts), so the page comes no later than it would have,
// and the page's head script takes ?_b=1 back off the address (src/lib/boot.ts).
const HOP = "_b";
const NO_SHELL = /^\/(?:auth|api|birdnet|_next)(?:\/|$)/;
const QUICK_MS = 250; // a page that answers this fast just shows
const waiting = new Map(); // page address -> { res: Promise<Response>, at }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openApp(event) {
  const req = event.request;
  const page = Promise.resolve(event.preloadResponse).then((res) => res || fetch(req));
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows.length) return page; // moving between pages, or a reload: nothing changes
  const quick = await Promise.race([page.catch(() => null), sleep(QUICK_MS).then(() => undefined)]);
  if (quick) return quick;
  if (quick === null) return page; // offline or failed: the browser shows its usual error
  const url = new URL(req.url);
  const key = url.pathname + url.search;
  for (const [k, v] of waiting) if (Date.now() - v.at > 30000) waiting.delete(k);
  waiting.set(key, { res: page, at: Date.now() });
  event.waitUntil(page.then(() => sleep(30000)).catch(() => {}));
  url.searchParams.set(HOP, "1");
  return new Response(bootShell(url.pathname + url.search + url.hash), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function afterShell(url) {
  url.searchParams.delete(HOP);
  const key = url.pathname + url.search;
  const kept = waiting.get(key);
  waiting.delete(key);
  if (kept && Date.now() - kept.at < 30000) {
    try {
      return await kept.res;
    } catch {
      // fall through and ask again
    }
  }
  return fetch(url.href, { credentials: "same-origin", redirect: "manual", headers: { Accept: "text/html" } });
}

// A copy of the app's loading screen (BootLoader and "Loading screen" in globals.css): keep alike.
function bootShell(next) {
  const paw =
    '<ellipse cx="0" cy="4" rx="6" ry="5"/><ellipse cx="-7" cy="-4" rx="2.4" ry="3"/><ellipse cx="-2.6" cy="-8" rx="2.4" ry="3"/>' +
    '<ellipse cx="2.6" cy="-8" rx="2.4" ry="3"/><ellipse cx="7" cy="-4" rx="2.4" ry="3"/>';
  let paws = "";
  for (let i = 0; i < 6; i++)
    paws += '<use href="#p" class="paw" style="animation-delay:' + i * 0.25 + 's" transform="translate(' + (20 + i * 40) + " " + (i % 2 ? 32 : 16) + ') rotate(90) scale(1.2)"/>';
  const lines = ["Rounding up the pack…", "Checking the trail map…", "Packing the s’mores…", "Lighting the campfire…"]
    .map((l, i) => '<span style="animation-delay:' + i * 2 + 's">' + l + "</span>")
    .join("");
  const go = JSON.stringify(next);
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="theme-color" content="#1b4332"><title>Pack 361</title>' +
    "<style>" +
    ":root{--bg:#faf9f4;--pine:#1b4332;--navy:#1b2638;--muted:#414844}" +
    "html.dark{--bg:#0f1411;--pine:#8fd1ad;--navy:#dbe3ee;--muted:#a9b3ac}" +
    "html,body{margin:0;height:100%;background:var(--bg);font-family:system-ui,-apple-system,sans-serif}" +
    "body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:8vh;box-sizing:border-box;color:var(--pine)}" +
    ".wolf{animation:bob .9s ease-in-out infinite}" +
    ".wolf img{display:block;width:120px;height:120px;border-radius:9999px;box-shadow:0 0 0 4px #feba38,0 10px 24px rgb(27 67 50/.18)}" +
    ".shadow{width:96px;height:14px;margin-top:10px;border-radius:9999px;background:radial-gradient(closest-side,rgb(27 67 50/.22),transparent);animation:sh .9s ease-in-out infinite}" +
    "svg{width:240px;height:48px;margin-top:14px;fill:currentColor}" +
    ".paw{opacity:0;animation:paw 2.4s linear infinite}" +
    "p{margin:0}.name{margin-top:18px;font-size:1.25rem;line-height:1.75rem;font-weight:800;color:var(--navy)}" +
    ".lines{position:relative;height:1.5rem;width:100%;margin-top:2px;font-size:.875rem;font-weight:600;color:var(--muted)}" +
    ".lines span{position:absolute;inset:0;text-align:center;opacity:0;animation:line 8s ease infinite}" +
    "@keyframes bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-10px) rotate(3deg)}}" +
    "@keyframes sh{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(.75);opacity:.6}}" +
    "@keyframes paw{0%{opacity:0}6%,55%{opacity:.85}75%,100%{opacity:0}}" +
    "@keyframes line{0%{opacity:0;transform:translateY(6px)}4%,21%{opacity:1;transform:none}25%,100%{opacity:0;transform:translateY(-6px)}}" +
    "@media (prefers-reduced-motion:reduce){.wolf,.shadow,.paw,.lines span{animation:none}.paw,.lines span:first-child{opacity:.85}}" +
    "</style>" +
    '<script>try{var t=localStorage.getItem("pack-theme");if(t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.className="dark"}catch(e){}</script>' +
    '</head><body role="status" aria-label="Loading Pack 361">' +
    '<div class="wolf"><img src="/badge.png" alt="" width="120" height="120"></div><div class="shadow"></div>' +
    '<svg viewBox="0 0 240 48" aria-hidden="true"><defs><g id="p">' + paw + "</g></defs>" + paws + "</svg>" +
    '<p class="name">Pack 361</p><p class="lines">' + lines + "</p>" +
    // Draw this screen first, then go on to the page: the phone keeps showing it until the page
    // starts arriving. (The timer covers a phone that doesn't draw yet, opened in the background.)
    "<script>var g=0;function go(){if(!g){g=1;location.replace(" + go + ")}}requestAnimationFrame(function(){requestAnimationFrame(go)});setTimeout(go,300)</script>" +
    "</body></html>"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BIRDNET.test(url.pathname)) {
    event.respondWith(birdnetFirst(event));
  } else if (STATIC.test(url.pathname)) {
    event.respondWith(cacheFirst(event));
  } else if (req.mode === "navigate" && OFFLINE_PAGES.test(url.pathname)) {
    event.respondWith(networkFirst(event));
  } else if (req.mode === "navigate" && url.searchParams.get(HOP) === "1") {
    event.respondWith(afterShell(url));
  } else if (req.mode === "navigate" && !NO_SHELL.test(url.pathname)) {
    event.respondWith(openApp(event));
  } else if (req.mode === "navigate" && self.registration.navigationPreload) {
    // Other pages aren't saved: use the preloaded response so the page isn't requested twice.
    event.respondWith(Promise.resolve(event.preloadResponse).then((res) => res || fetch(req)));
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
