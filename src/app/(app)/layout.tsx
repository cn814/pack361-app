import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import NavProgress from "@/components/NavProgress";
import Toast from "@/components/Toast";
import { Suspense } from "react";
import ServiceWorkerSetup from "@/components/ServiceWorkerSetup";
import { displayName, getFeaturedTab, requireMember } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const featured = await getFeaturedTab();
  const initials = (displayName(me)[0] + me.last_name[0]).toUpperCase();
  return (
    <div className="min-h-dvh w-full lg:pl-64 print:pl-0">
      <Suspense>
        <NavProgress />
        <Toast />
      </Suspense>
      <ServiceWorkerSetup mode="register" />
      <header className="print:hidden sticky top-0 z-40 mx-auto flex max-w-md items-center justify-between bg-pine px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-md lg:hidden">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badge.png" alt="" className="h-10 w-10 rounded-full ring-2 ring-white/25" />
          <span>
            <span className="block text-sm font-bold leading-tight">Pack 361</span>
            <span className="block text-xs text-mint-200/80">Ellicott City, MD</span>
          </span>
        </Link>
        <Link
          href="/family"
          aria-label="My family"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-xs font-extrabold text-pine-950 ring-2 ring-white/20"
        >
          {initials}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28 pt-4 lg:max-w-3xl lg:px-8 lg:pb-12 lg:pt-8 lg:has-[.page-wide]:max-w-6xl print:max-w-none print:pb-0">
        {children}
      </main>
      <BottomNav featured={featured} me={{ initials, name: `${displayName(me)} ${me.last_name}` }} />
    </div>
  );
}
