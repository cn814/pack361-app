import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths anyone can open without signing in
// (the calendar feed and cron job check their own token/secret)
const PUBLIC_PATHS = ["/login", "/get", "/safety", "/join", "/auth", "/manifest.webmanifest", "/sw.js", "/api/calendar", "/api/cron"];

// The pack's public website (pack361.org, www.pack361.org) shows only the public join pages.
// Everything else there goes to the members' app at APP_ORIGIN.
const SITE_HOSTS = ["pack361.org", "www.pack361.org"];
const APP_ORIGIN = "https://app.pack361.org";
// Files the public pages need (icons, photos); everything else on the site host moves to the app.
const SITE_ASSETS = /^\/(?:_next\/|join\/|badge\.png$|icon|apple-icon|favicon|robots\.txt$|sitemap\.xml$)/;

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next(); // not configured yet: pages show a setup notice

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Refreshes the session cookie if needed and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (signedIn && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Static files skip the sign-in check (the opening video, the service worker, the manifest).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|js|webmanifest)$).*)"],
};
