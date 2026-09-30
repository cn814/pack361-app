"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, CalendarDays, House, Tent, Users } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/scouts", label: "Scouts", icon: Award, match: (p: string) => p.startsWith("/scouts") },
  { href: "/events", label: "Events", icon: CalendarDays, match: (p: string) => p.startsWith("/events") },
  { href: "/campouts", label: "Campouts", icon: Tent, match: (p: string) => p.startsWith("/campouts") },
  { href: "/leaders", label: "Leaders", icon: Users, match: (p: string) => p.startsWith("/leaders") },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md justify-around px-2">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-14 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-semibold ${
                  active ? "text-pine" : "text-muted"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
