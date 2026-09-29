import type { Metadata } from "next";
import { Lock, Tent, Camera, Award, CalendarDays } from "lucide-react";
import LoginForm from "./LoginForm";
import { supabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <section className="card overflow-hidden p-0 text-center">
        <div className="h-1.5 bg-pine" />
        <div className="p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow-[var(--shadow-card)]" />
          <span className="badge mb-2 bg-mint text-pine">
            <Lock className="h-3 w-3" aria-hidden /> Pack members only
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack 361 Ellicott City</h1>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Pack news, campouts, events and leader contacts for Pack 361 families.
          </p>
          <div className="mt-6">
            {supabaseConfigured() ? (
              <LoginForm />
            ) : (
              <p className="rounded-xl bg-gold-50 px-3 py-3 text-sm text-gold-800">
                The app isn&apos;t connected to its database yet. (Set the Supabase environment variables.)
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title mb-2">Signing in unlocks</h2>
        <ul className="grid grid-cols-2 gap-2 text-xs font-semibold text-navy">
          <li className="flex items-center gap-2 rounded-xl bg-surface-low p-2.5"><CalendarDays className="h-4 w-4 text-pine" aria-hidden />Pack calendar</li>
          <li className="flex items-center gap-2 rounded-xl bg-surface-low p-2.5"><Tent className="h-4 w-4 text-pine" aria-hidden />Campout plans</li>
          <li className="flex items-center gap-2 rounded-xl bg-surface-low p-2.5"><Award className="h-4 w-4 text-pine" aria-hidden />Advancement</li>
          <li className="flex items-center gap-2 rounded-xl bg-surface-low p-2.5"><Camera className="h-4 w-4 text-pine" aria-hidden />Photo vault</li>
        </ul>
      </section>

      <p className="px-2 text-center text-xs text-muted">
        Not on the roster, or changed your email? Contact the Committee Chair or email{" "}
        <a className="font-bold text-pine underline" href="mailto:info@pack361.org">info@pack361.org</a>.
      </p>
    </main>
  );
}
