import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import NavProgress from "@/components/NavProgress";
import Toast from "@/components/Toast";
import { Suspense } from "react";
import ServiceWorkerSetup from "@/components/ServiceWorkerSetup";
import { Bell, Search } from "lucide-react";
import { displayName, requireMember } from "@/lib/data";
import { canLead, getMode } from "@/lib/mode";
import ModeSwitch from "@/components/ModeSwitch";
import { getInboxCount } from "@/lib/inbox";
import ViewAsBanner from "@/components/ViewAsBanner";
import BetaBanner from "@/components/BetaBanner";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const [inbox, mode] = await Promise.all([getInboxCount(), getMode(me)]);
  const initials = (displayName(me)[0] + me.last_name[0]).toUpperCase();
  return (
    <div className="min-h-dvh w-full lg:pl-64 print:pl-0">
      <Suspense>
        <NavProgress />
        <Toast />
      </Suspense>
      <ServiceWorkerSetup mode="register" />
      <BetaBanner />
      {/* Full-width green bar; the content inside lines up with the page column. */}
      <header className="print:hidden sticky top-0 z-40 bg-pine pt-[env(safe-area-inset-top)] text-white shadow-md lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badge.png" alt="" className="h-10 w-10 rounded-full ring-2 ring-white/25" />
            <span>
              <span className="block text-sm font-bold leading-tight">Pack 361</span>
              <span className="block text-xs text-mint-200/80">Ellicott City, MD</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/search"
              aria-label="Search the pack"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/15"
            >
              <Search className="h-6 w-6" aria-hidden />
            </Link>
            <Link
              href="/inbox"
              prefetch={false}
              aria-label={inbox ? `Notifications, ${inbox} new` : "Notifications"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/15"
            >
              <Bell className="h-6 w-6" aria-hidden />
              {inbox > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-pine">
                  {inbox > 9 ? "9+" : inbox}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
      <ViewAsBanner me={me} />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28 pt-4 lg:max-w-3xl lg:px-8 lg:pb-12 lg:pt-8 lg:has-[.page-wide]:max-w-6xl print:max-w-none print:pb-0">
        {children}
      </main>
      <BottomNav
        me={{ initials, name: `${displayName(me)} ${me.last_name}` }}
        inbox={inbox}
        leaderMode={mode === "leader"}
        modeSwitch={canLead(me) ? <ModeSwitch mode={mode} dark /> : undefined}
      />
    </div>
  );
}
