"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  Vote,
  CalendarDays,
  CarFront,
  Fish,
  Footprints,
  House,
  PartyPopper,
  Rocket,
  Sailboat,
  Tent,
  Images,
  Users,
  type LucideIcon,
  FolderOpen,
  HandCoins,
} from "lucide-react";
import type { FeaturedKind, FeaturedTab } from "@/lib/featured";

const FEATURED_ICON: Record<FeaturedKind, LucideIcon> = {
  campout: Tent,
  derby: CarFront,
  fishing: Fish,
  space_derby: Rocket,
  regatta: Sailboat,
  blue_gold: PartyPopper,
  crossover: Footprints,
};

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  featured?: boolean;
}

/**
 * Main navigation. Phones: a bottom tab bar. Computers (lg and up): a left sidebar with the
 * same tabs plus the pack name, Photos and My family.
 */
export default function BottomNav({
  featured,
  me,
  inbox = 0,
}: {
  featured: FeaturedTab | null;
  me: { initials: string; name: string };
  inbox?: number;
}) {
  const path = usePathname();
  // Highlight the tapped tab right away instead of waiting for the page to load.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  if (tapped && tapped.from !== path) setTapped(null); // the new page arrived
  const pending = tapped && tapped.from === path ? tapped.href : null;

  // Step-by-step screens (uploading photos) hide the phone tab bar: after the photo picker
  // closes, iPhone Safari can draw the fixed bar in the middle of the page, over the form.
  const focused = path.startsWith("/photos/upload");
  const onFeatured = (p: string) => Boolean(featured && p.startsWith(featured.href));
  const tabs: Tab[] = [
    { href: "/", label: "Home", icon: House, match: (p) => p === "/" },
    { href: "/scouts", label: "Scouts", icon: Award, match: (p) => p.startsWith("/scouts") },
    ...(featured
      ? [{ href: featured.href, label: featured.label, icon: FEATURED_ICON[featured.kind], match: onFeatured, featured: true }]
      : []),
    {
      href: "/events",
      label: "Events",
      icon: CalendarDays,
      match: (p) => (p.startsWith("/events") || p.startsWith("/campouts")) && !onFeatured(p),
    },
    { href: "/leaders", label: "Leaders", icon: Users, match: (p) => p.startsWith("/leaders") || p.startsWith("/admin") },
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
      className={`${focused ? "max-lg:hidden " : ""}print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:inset-y-0 lg:right-auto lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-t-0 lg:bg-pine-950 lg:pb-0 lg:backdrop-blur-none`}
    >
      <Link href="/" className="hidden items-center gap-3 px-5 pb-6 pt-6 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="" className="h-12 w-12 rounded-full ring-2 ring-white/20" />
        <span>
          <span className="block font-extrabold leading-tight text-white">Pack 361</span>
          <span className="block text-xs text-mint-200/80">Ellicott City, MD</span>
        </span>
      </Link>
      <ul className="mx-auto flex max-w-md justify-around px-2 lg:mx-0 lg:max-w-none lg:flex-1 lg:flex-col lg:justify-start lg:gap-1 lg:px-3">
        {tabs.map(({ href, label, icon: Icon, match, featured: special }) => {
          const active = pending ? pending === href : match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={tap(href, match)}
                className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition active:scale-90 active:bg-mint lg:min-w-0 lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm lg:font-semibold lg:active:scale-100 lg:active:bg-white/15 ${
                  active
                    ? "text-[12.5px] font-extrabold text-pine lg:bg-white/10 lg:text-white"
                    : special
                      ? "text-[11px] font-semibold text-gold-800 lg:text-gold lg:hover:bg-white/5"
                      : "text-[11px] font-medium text-muted lg:text-mint-200 lg:hover:bg-white/5 lg:hover:text-white"
                }`}
              >
                {special ? (
                  <span
                    className={`-mt-0.5 flex items-center justify-center rounded-full lg:mt-0 lg:h-7 lg:w-7 ${active ? "h-8 w-8 bg-pine text-white ring-2 ring-mint lg:bg-gold lg:text-pine-950 lg:ring-0" : "h-7 w-7 bg-gold text-pine-950"}`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : (
                  // The current page's icon sits in a light green pill (phones), so it's clear where you are.
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full lg:h-auto lg:w-auto ${active ? "bg-mint lg:bg-transparent" : ""}`}>
                    <Icon className={`${active ? "h-6 w-6" : "h-5 w-5"} lg:mx-1 lg:h-5 lg:w-5`} strokeWidth={active ? 2.75 : 2} aria-hidden />
                  </span>
                )}
                <span className="max-w-16 truncate lg:max-w-none">{label}</span>
              </Link>
            </li>
          );
        })}
        {(
          [
            { href: "/inbox", label: "Notifications", icon: Bell, count: inbox },
            { href: "/guide", label: "Pack guide", icon: BookOpen, count: 0 },
            { href: "/documents", label: "Documents", icon: FolderOpen, count: 0 },
            { href: "/pay", label: "Pay the pack", icon: HandCoins, count: 0 },
            { href: "/polls", label: "Polls", icon: Vote, count: 0 },
          ] as const
        ).map(({ href, label, icon: Icon, count }) => {
          const on = pending ? pending === href : path.startsWith(href);
          return (
            <li key={href} className="hidden lg:block">
              <Link
                href={href}
                prefetch={href === "/inbox" ? false : undefined}
                onClick={tap(href, (p) => p.startsWith(href))}
                aria-current={path.startsWith(href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  on ? "bg-white/10 text-white" : "text-mint-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="mx-1 h-5 w-5" aria-hidden /> {label}
                {count > 0 && <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-[11px] font-extrabold text-white">{count > 9 ? "9+" : count}</span>}
              </Link>
            </li>
          );
        })}
        <li className="hidden lg:block">
          <Link
            href="/photos"
            onClick={tap("/photos", (p) => p.startsWith("/photos"))}
            aria-current={path.startsWith("/photos") ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              (pending ? pending === "/photos" : path.startsWith("/photos")) ? "bg-white/10 text-white" : "text-mint-200 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Images className="mx-1 h-5 w-5" aria-hidden /> Photos
          </Link>
        </li>
      </ul>
      <Link
        href="/family"
        onClick={tap("/family", (p) => p.startsWith("/family"))}
        className={`m-3 hidden items-center gap-3 rounded-xl p-2 transition lg:flex ${path.startsWith("/family") ? "bg-white/10" : "hover:bg-white/5"}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-extrabold text-pine-950">{me.initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{me.name}</span>
          <span className="block text-xs text-mint-200/80">My family</span>
        </span>
      </Link>
    </nav>
  );
}
