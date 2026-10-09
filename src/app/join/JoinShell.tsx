import Link from "next/link";
import type { ReactNode } from "react";
import { LogIn, Mail } from "lucide-react";
import { HEADER } from "./photos";

/** Header and footer for the public pages (pack361.org). */
export default function JoinShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-deep text-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/join" className="flex items-center gap-2 font-extrabold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badge.png" alt="" className="h-9 w-9 rounded-full" />
            Pack 361
          </Link>
          <Link href="/login" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
            <LogIn className="h-4 w-4" aria-hidden /> Member sign in
          </Link>
        </div>
      </header>
      {HEADER && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={HEADER.src} alt={HEADER.alt} width={HEADER.width} height={HEADER.height} className="h-auto w-full" />
      )}
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Cub Scout Pack 361 · Ellicott City, Maryland · Part of{" "}
            <a href="https://www.scouting.org/" className="font-semibold text-pine underline" target="_blank" rel="noopener noreferrer">
              Scouting America
            </a>
          </p>
          <a href="mailto:app@pack361.org" className="inline-flex items-center gap-1 font-semibold text-pine">
            <Mail className="h-3.5 w-3.5" aria-hidden /> app@pack361.org
          </a>
        </div>
      </footer>
    </div>
  );
}
