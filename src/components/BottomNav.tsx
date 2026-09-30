"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award,
  CalendarDays,
  CarFront,
  Footprints,
  House,
  PartyPopper,
  Rocket,
  Sailboat,
  Tent,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FeaturedKind, FeaturedTab } from "@/lib/featured";

const FEATURED_ICON: Record<FeaturedKind, LucideIcon> = {
  campout: Tent,
  derby: CarFront,
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

export default function BottomNav({ featured }: { featured: FeaturedTab | null }) {
  const path = usePathname();
  // Highlight the tapped tab right away instead of waiting for the page to load.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  if (tapped && tapped.from !== path) setTapped(null); // the new page arrived
  const pending = tapped && tapped.from === path ? tapped.href : null;

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

  return (
    <nav
      aria-label="Main"
      className="print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md justify-around px-2">
        {tabs.map(({ href, label, icon: Icon, match, featured: special }) => {
          const active = pending ? pending === href : match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => !match(path) && setTapped({ href, from: path })}
                className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold transition active:scale-90 active:bg-mint ${
                  active ? "text-pine" : special ? "text-gold-800" : "text-muted"
                }`}
              >
                {special ? (
                  <span className={`-mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-pine text-white" : "bg-gold text-pine-950"}`}>
                    <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                )}
                <span className="max-w-16 truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
