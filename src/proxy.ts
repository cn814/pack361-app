import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./lib/supabase/env";
import { CSP_REPORT_PATH, cspHeaderName, newNonce, scriptPolicy } from "./lib/csp";
import { latestCodeMs } from "./lib/code-fresh";
import {
  ACTIVE_COOKIE,
  ACTIVE_COOKIE_OPTIONS,
  LEFT_HEADER,
  LOCKED_HEADER,
  LOCK_MS,
  REFRESH_MS,
  countsAsUse,
  idleState,
  lastActive,
  openWhileLocked,
  readActive,
  stampActive,
} from "./lib/idle";

// Paths anyone can open without signing in
// (the calendar feed and cron job check their own token/secret)
// /birdnet: the bird sound ID model files (public, no pack data).
// /.well-known: security.txt (how to report a security problem).
const PUBLIC_PATHS = ["/login", "/get", "/safety", "/terms", "/privacy", "/join", "/auth", "/manifest.webmanifest", "/sw.js", "/api/calendar", "/api/cron", "/birdnet", "/.well-known", CSP_REPORT_PATH];

// The pack's public website (pack361.org, www.pack361.org) shows only the public join pages.
// Everything else there goes to the members' app at APP_ORIGIN.
const SITE_HOSTS = ["pack361.org", "www.pack361.org"];
const APP_ORIGIN = "https://app.pack361.org";
// Files the public pages need (icons, photos); everything else on the site host moves to the app.
const SITE_ASSETS = /^\/(?:_next\/|join\/|badge\.png$|icon|apple-icon|favicon|robots\.txt$|sitemap\.xml$|\.well-known\/security\.txt$)/;

function siteRoute(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!SITE_HOSTS.includes(host)) return null;
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") {
    const to = request.nextUrl.clone();
    to.pathname = "/join";
    return NextResponse.rewrite(to);
  }
  if (pathname === "/join" || SITE_ASSETS.test(pathname)) return NextResponse.next();
  // Build the address on the app's origin and set the path, rather than parsing the request
  // path as a URL: "//evil.com" or "/\evil.com" would otherwise point off-site.
  const to = new URL(APP_ORIGIN);
  to.pathname = "/" + pathname.replace(/^[/\\]+/, "");
  to.search = search;
  return NextResponse.redirect(to, 308);
}

export async function proxy(request: NextRequest) {
  const site = siteRoute(request);
  if (site) return site;

  // The service worker's opening screen goes on to the page with ?_b=1 and answers that itself
  // with the page request already under way (public/sw.js), so the browser's automatic early copy
  // of that request isn't needed: answer it empty instead of building the page twice.
  if (request.nextUrl.searchParams.get("_b") === "1" && request.headers.has("service-worker-navigation-preload")) {
    return new NextResponse(null, { status: 204 });
  }

  // The strict script policy (src/lib/csp.ts). Next.js reads the nonce from the request's policy
  // header and adds it to its own scripts.
  const nonce = newNonce();
  const policy = scriptPolicy(nonce);
  const policyHeader = cspHeaderName();
  request.headers.set("x-nonce", nonce);
  request.headers.set(policyHeader.toLowerCase(), policy);
  // Set below; never taken from the browser.
  request.headers.set(LOCKED_HEADER, "0");
  request.headers.set(LEFT_HEADER, "");
  const withPolicy = (res: NextResponse) => {
    res.headers.set(policyHeader, policy);
    return res;
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return withPolicy(NextResponse.next({ request })); // not configured yet: pages show a setup notice

  // Cookies to send back (a refreshed sign-in, the "last used" stamp), kept so any response
  // built below carries them, including redirects.
  const outCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const outHeaders: Record<string, string> = {};
  const finish = (res: NextResponse) => {
    outCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    Object.entries(outHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  };

  const supabase = createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          outCookies.push({ name, value, options });
        });
        Object.assign(outHeaders, headers ?? {});
      },
    },
  });

  // Refreshes the session cookie if needed and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = Boolean(claims?.sub);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }

  // Away from the app (src/lib/idle.ts): a leader's session locks after 15 minutes without use,
  // and everyone is signed out after 30 days.
  if (signedIn && claims && !isPublic) {
    const now = Date.now();
    const sessionId = String(claims.session_id ?? claims.sub);
    const aal2 = claims.aal === "aal2";
    const stamped = await readActive(request.cookies.get(ACTIVE_COOKIE)?.value, sessionId);
    const last = lastActive({ stamped, codeAt: latestCodeMs(claims), aal2, now });
    const state = idleState({ last, aal2, now });
    if (state === "signed-out") {
      await supabase.auth.signOut({ scope: "local" });
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      to.search = "?away=1";
      const res = finish(NextResponse.redirect(to, request.method === "GET" ? 307 : 303));
      res.cookies.delete(ACTIVE_COOKIE);
      return res;
    }
    if (state === "locked") {
      request.headers.set(LOCKED_HEADER, "1");
      request.headers.set(LEFT_HEADER, "0");
      if (!openWhileLocked(path)) {
        const to = request.nextUrl.clone();
        to.pathname = "/two-step";
        to.search = "";
        to.searchParams.set("next", path + request.nextUrl.search);
        return finish(NextResponse.redirect(to, request.method === "GET" ? 307 : 303));
      }
    } else {
      const use = countsAsUse(request.method, path, request.headers);
      if (use && (stamped === null || now - stamped > REFRESH_MS)) {
        const value = await stampActive(sessionId, now);
        request.cookies.set(ACTIVE_COOKIE, value);
        outCookies.push({ name: ACTIVE_COOKIE, value, options: ACTIVE_COOKIE_OPTIONS });
      }
      if (aal2) request.headers.set(LEFT_HEADER, String(use ? LOCK_MS : Math.max(0, LOCK_MS - (now - last))));
    }
  }

  if (signedIn && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return finish(NextResponse.redirect(to));
  }
  return withPolicy(finish(NextResponse.next({ request })));
}

export const config = {
  // Static files skip the sign-in check (the opening video, the service worker, the manifest).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|js|webmanifest)$).*)"],
};
