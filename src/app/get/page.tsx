import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import InstallHelp from "@/components/InstallHelp";

export const metadata: Metadata = { title: "Get the Pack 361 app" };

/**
 * Where the "get the app" QR code goes: put the app on the home screen (one tap where the phone
 * allows it, the steps on iPhone), then sign in from the new icon.
 */
export default function GetTheApp() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <section className="card overflow-hidden p-0 text-center">
        <div className="h-1.5 bg-brand" />
        <div className="space-y-2 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="mx-auto h-24 w-24 rounded-[22%] shadow-[var(--shadow-float)]" />
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Get the Pack 361 app</h1>
          <p className="mx-auto max-w-xs text-sm text-muted">
            The pack calendar, RSVPs, campouts, your scout&apos;s advancement and pack news. Free, nothing to download from an app
            store.
          </p>
          <span className="badge bg-mint text-pine">
            <Lock className="h-3 w-3" aria-hidden /> For Pack 361 families and leaders
          </span>
        </div>
      </section>

      <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-sage">Step 1</p>
      <InstallHelp />

      <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-sage">Step 2</p>
      <Link href="/login" className="card flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold text-pine-950">Open Pack 361 and sign in</span>
          <span className="block text-xs text-muted">
            Use the email you gave the pack. We email you a code; there&apos;s no password. Not on the roster yet? You can ask to
            join after signing in.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </Link>

      <p className="text-center text-xs text-muted">
        Questions? <a href="mailto:app@pack361.org" className="font-semibold text-pine underline">app@pack361.org</a> ·{" "}
        <Link href="/join" className="font-semibold text-pine underline">
          About the pack
        </Link>
      </p>
    </main>
  );
}
