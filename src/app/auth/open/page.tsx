import type { Metadata } from "next";
import { KeyRound, LogIn } from "lucide-react";
import OpenedFrom from "./OpenedFrom";

export const metadata: Metadata = { title: "Sign in" };

// Landing page for the sign-in link on phones (see /auth/confirm). Nothing is signed in until
// the person taps the button, so the code in the email still works in the home-screen app.
export default async function OpenPage({ searchParams }: PageProps<"/auth/open">) {
  const { token_hash, type } = await searchParams;
  const hash = typeof token_hash === "string" ? token_hash : "";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="" className="mx-auto h-20 w-20 rounded-full" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-pine-950">Sign in to Pack 361</h1>
      </div>

      <section className="card space-y-2 border-l-4 border-l-gold">
        <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
          <KeyRound className="h-5 w-5 text-gold-700" aria-hidden /> Using the app on your home screen?
        </h2>
        <p className="text-sm text-ink">
          Don&apos;t tap anything here. Close this, open <b>Pack 361</b> from your home screen, and type the <b>6-digit code</b>{" "}
          from the email.
        </p>
        <OpenedFrom />
      </section>

      <section className="card space-y-3">
        <h2 className="font-extrabold text-pine-950">Or use Pack 361 in this browser</h2>
        <form action="/auth/confirm" method="post">
          <input type="hidden" name="token_hash" value={hash} />
          <input type="hidden" name="type" value={typeof type === "string" ? type : "email"} />
          <button type="submit" className="btn-primary w-full" disabled={!hash}>
            <LogIn className="h-4 w-4" aria-hidden /> Sign in here
          </button>
        </form>
        <p className="text-xs text-muted">This uses up the code, so after this the app on your home screen would need a new one.</p>
      </section>
    </main>
  );
}
