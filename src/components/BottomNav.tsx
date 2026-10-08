"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Award, Bell, CalendarDays, House, LayoutGrid, Search, ShieldCheck, type LucideIcon } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

/** Pages that belong to the Pack tab (its menu leads to them). */
const PACK_PATHS = ["/pack", "/pay", "/reimburse", "/store", "/guide", "/documents", "/photos", "/polls", "/recruit", "/leaders", "/inbox", "/nature", "/geocaching", "/gear", "/help-wanted"];
/** Pages that belong to the Leaders tab (leader tools), even when they sit under another tab's address. */
const LEADER_PATHS = [
  "/lead",
  "/admin",
  "/announce",
  "/leaders/money",
  "/leaders/training",
  "/leaders/attendance",
  "/leaders/paperwork",
  "/leaders/reports",
  "/scouts/review",
  "/scouts/awards",
  "/scouts/den",
  "/scouts/import",
  "/events/new",
  "/events/council",
  "/gear/manage",
  "/polls/new",
];
const under = (p: string, prefixes: string[]) => prefixes.some((x) => p === x || p.startsWith(x + "/"));

/** The Pack menu's main links, repeated under "Pack" in the computer sidebar. */
const PACK_LINKS = [
  { href: "/pay", label: "Pay the pack" },
  { href: "/store", label: "Fundraisers and store" },
  { href: "/guide", label: "Pack guide" },
  { href: "/documents", label: "Documents" },
  { href: "/photos", label: "Photos" },
  { href: "/leaders", label: "Leader contacts" },
];

/**
 * Main navigation: tabs that never move. Home, Calendar, Scouts and Pack for everyone, and
 * Leaders for leaders only (what's in the app depends on which tabs you have). Me is the initials
 * at the top right on phones (src/app/(app)/layout.tsx). Phones: a bottom tab bar. Computers (lg
 * and up): a left sidebar with the same tabs, the Pack menu's main links, notifications and Me.
 */
export default function BottomNav({
  me,
  inboxBadge,
  leaders = false,
}: {
  me: { initials: string; name: string };
  /** The number on Notifications (computer sidebar), streamed in from the server. */
  inboxBadge?: ReactNode;
  /** Show the Leaders tab. */
  leaders?: boolean;
}) {
  const path = usePathname();
  // Highlight the tapped tab right away instead of waiting for the page to load.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  if (tapped && tapped.from !== path) setTapped(null); // the new page arrived
  const pending = tapped && tapped.from === path ? tapped.href : null;

  // Step-by-step screens (uploading photos) hide the phone tab bar: after the photo picker
  // closes, iPhone Safari can draw the fixed bar in the middle of the page, over the form.
  const focused = path.startsWith("/photos/upload");
  const lead = (p: string) => leaders && under(p, LEADER_PATHS);
  const tabs: Tab[] = [
    { href: "/", label: "Home", icon: House, match: (p) => p === "/" },
    { href: "/events", label: "Calendar", icon: CalendarDays, match: (p) => under(p, ["/events", "/campouts", "/meetings"]) && !lead(p) },
    { href: "/scouts", label: "Scouts", icon: Award, match: (p) => under(p, ["/scouts"]) && !lead(p) },
    { href: "/pack", label: "Pack", icon: LayoutGrid, match: (p) => under(p, PACK_PATHS) && !lead(p) },
    ...(leaders ? [{ href: "/lead", label: "Leaders", icon: ShieldCheck, match: lead }] : []),
  ];

  const tap = (href: string, match: (p: string) => boolean) => () => {
    if (match(path)) return;
    const t = { href, from: path };
    setTapped(t);
    // If the page never arrives (offline), stop highlighting the tapped tab.
    setTimeout(() => setTapped((cur) => (cur === t ? null : cur)), 15000);
  };

  return (
    <nav
      aria-label="Main"
      className={`${focused ? "max-lg:hidden " : ""}print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:inset-y-0 lg:right-auto lg:flex lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-t-0 lg:bg-deep lg:pb-0 lg:backdrop-blur-none`}
    >
      <Link href="/" className="hidden items-center gap-3 px-5 pb-6 pt-6 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge-96.png" alt="" width={48} height={48} className="h-12 w-12 rounded-full ring-2 ring-white/20" />
        <span>
          <span className="block font-extrabold leading-tight text-white">Pack 361</span>
          <span className="block text-xs text-mint-200/80">Ellicott City, MD</span>
        </span>
      </Link>
      <form action="/search" role="search" className="mx-3 mb-4 hidden items-center gap-2 rounded-xl bg-white/10 px-3 lg:flex">
        <Search className="h-4 w-4 shrink-0 text-mint-200" aria-hidden />
        <input
          name="q"
          type="search"
          placeholder="Search the pack"
          aria-label="Search the pack"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-mint-200/70 outline-none"
        />
      </form>
      <ul className={`mx-auto grid max-w-md ${leaders ? "grid-cols-5" : "grid-cols-4"} px-1 lg:mx-0 lg:flex lg:max-w-none lg:flex-col lg:gap-1 lg:px-3`}>
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = pending ? pending === href : match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={tap(href, match)}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition active:scale-90 active:bg-mint lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-[15px] lg:active:scale-100 lg:active:bg-white/15 ${
                  active
                    ? "text-[11.5px] font-extrabold text-pine-950 lg:bg-gold lg:text-on-gold"
                    : "text-[11.5px] font-semibold text-muted lg:text-mint-200 lg:hover:bg-white/5 lg:hover:text-white"
                }`}
              >
                {/* The current tab's icon sits in a light green pill (phones), so it's clear where you are. */}
                <span className={`flex h-7 w-14 items-center justify-center rounded-full lg:h-auto lg:w-auto ${active ? "bg-mint lg:bg-transparent" : ""}`}>
                  <Icon className="h-[22px] w-[22px] lg:mx-1 lg:h-5 lg:w-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                </span>
                <span className="truncate">{label}</span>
              </Link>
              {href === "/pack" && (
                <ul className="mb-1 ml-11 mt-0.5 hidden space-y-0.5 lg:block">
                  {PACK_LINKS.map((l) => {
                    const on = under(path, [l.href]);
                    return (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={tap(l.href, (p) => under(p, [l.href]))}
                          aria-current={on ? "page" : undefined}
                          className={`block rounded-lg px-2 py-1.5 text-[13px] ${on ? "font-bold text-white" : "text-mint-200 hover:text-white"}`}
                        >
                          {l.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
        <li className="mt-2 hidden lg:block">
          <Link
            href="/inbox"
            prefetch={false}
            onClick={tap("/inbox", (p) => under(p, ["/inbox"]))}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              under(path, ["/inbox"]) ? "bg-white/10 text-white" : "text-mint-200 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Bell className="mx-1 h-5 w-5" aria-hidden /> Notifications
            {inboxBadge}
          </Link>
        </li>
      </ul>
      <div className="mt-auto hidden space-y-3 p-3 lg:block">
        <Link href="/family" className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-extrabold text-on-gold">{me.initials}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-white">{me.name}</span>
        </Link>
      </div>
    </nav>
  );
}
