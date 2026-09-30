import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import NavProgress from "@/components/NavProgress";
import { displayName, requireMember } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const initials = (displayName(me)[0] + me.last_name[0]).toUpperCase();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md print:max-w-none">
      <NavProgress />
      <header className="print:hidden sticky top-0 z-40 flex items-center justify-between bg-pine px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-md">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl ring-1 ring-white/20" />
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
      <main className="space-y-4 px-4 pb-28 pt-4 print:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
