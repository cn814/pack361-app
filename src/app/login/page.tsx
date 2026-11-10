import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  CalendarDays,
  ChevronRight,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Tent,
} from "lucide-react";
import LoginForm from "./LoginForm";
import InstallHelp from "@/components/InstallHelp";
import ServiceWorkerSetup from "@/components/ServiceWorkerSetup";
import BetaBanner from "@/components/BetaBanner";
import { supabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

const UNLOCKS = [
  { icon: CalendarDays, label: "Pack calendar", desc: "Events, RSVPs and reminders, synced to your own calendar" },
  { icon: Tent, label: "Campout plans", desc: "Schedules, packing lists, carpools and weather" },
  { icon: Award, label: "Advancement", desc: "Your scout's adventures and what's next" },
  { icon: ShoppingBag, label: "Pack store", desc: "Pay dues, popcorn, apparel and uniforms" },
];

const PROTECTION = [
  "Follows Scouting America's Youth Protection rules: no private messaging, and scouts don't have accounts.",
  "Members only: just parents, guardians and leaders on the pack roster.",
  "Families see only their own scouts. Parents' contact info isn't shared with other parents.",
  "No passwords, encrypted connections, and no birthdates, addresses, medical or payment info stored.",
];

const safetyLink = (cls: string) => (
  <Link href="/safety" className={`inline-flex items-center gap-1 text-xs font-bold ${cls}`}>
    How we protect your family <ChevronRight className="h-3.5 w-3.5" aria-hidden />
  </Link>
);

/**
 * Sign in. On a phone: one column, the sign-in card first. On a computer: the pack's welcome on
 * the left (what the app does, youth protection) and signing in on the right. One form either way.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Signed out after 30 days without opening the app (src/lib/idle.ts).
  const away = (await searchParams).away === "1";
  const form = supabaseConfigured() ? (
    <LoginForm codeEnabled={process.env.LOGIN_CODE_ENABLED !== "false"} />
  ) : (
    <p className="rounded-xl bg-gold-50 px-3 py-3 text-sm text-gold-800">
      The app isn&apos;t connected to its database yet. (Set the Supabase environment variables.)
    </p>
  );
  const help = (
    <p className="px-2 text-center text-xs text-muted">
      Not on the roster, or changed your email? Contact the Committee Chair or email{" "}
      <a className="font-bold text-pine underline" href="mailto:app@pack361.org">
        app@pack361.org
      </a>
      . Run by Pack 361 volunteers; not an official Scouting America site.{" "}
      <Link className="font-bold text-pine underline" href="/terms">
        Terms of use
      </Link>{" "}
      ·{" "}
      <Link className="font-bold text-pine underline" href="/privacy">
        Data policy
      </Link>
    </p>
  );

  return (
    <>
      <BetaBanner />
      <ServiceWorkerSetup mode="clear" />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:px-10 lg:py-10 xl:gap-16">
        {/* Computers: the pack's welcome on the left */}
        <section className="relative hidden overflow-hidden rounded-[2rem] bg-deep p-9 text-white shadow-[var(--shadow-float)] lg:block xl:p-10">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badge.png" alt="" className="h-20 w-20 shrink-0 rounded-full shadow-[var(--shadow-float)]" />
            <div>
              <p className="text-4xl font-extrabold leading-tight tracking-tight">Pack 361</p>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Cub Scouts · Ellicott City, MD</p>
            </div>
          </div>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mint-200">
            Pack news, campouts, events and leader contacts for Pack 361 families, in one place.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {UNLOCKS.map((u) => (
              <li key={u.label} className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
                <u.icon className="h-5 w-5 text-gold" aria-hidden />
                <p className="mt-2 font-bold">{u.label}</p>
                <p className="text-sm leading-snug text-mint-200">{u.desc}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-white/15 pt-5">
            <h2 className="flex items-center gap-2 font-extrabold">
              <ShieldCheck className="h-5 w-5 text-gold" aria-hidden /> Built around youth protection
            </h2>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] leading-snug text-mint-200 marker:text-gold">
              {PROTECTION.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div className="mt-3">{safetyLink("text-gold")}</div>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="card overflow-hidden p-0 text-center lg:text-left">
            <div className="h-1.5 bg-brand" />
            <div className="p-6 lg:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge.png" alt="" className="mx-auto mb-3 h-24 w-24 rounded-full shadow-[var(--shadow-float)] lg:hidden" />
              <span className="badge mb-2 bg-mint text-pine lg:mb-3">
                <Lock className="h-3 w-3" aria-hidden /> Pack members only
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">
                <span className="lg:hidden">Pack 361 Ellicott City</span>
                <span className="hidden lg:inline">Sign in to Pack 361</span>
              </h1>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted lg:mx-0 lg:max-w-none">
                <span className="lg:hidden">Pack news, campouts, events and leader contacts for Pack 361 families.</span>
                <span className="hidden lg:inline">Use the email the pack has on file for you.</span>
              </p>
              <div className="mt-6">{away && (
                <p className="mb-3 rounded-xl bg-mint px-3 py-2 text-left text-sm text-pine">
                  You were signed out because the app hadn&apos;t been opened in a month. Sign in again below.
                </p>
              )}
              {form}</div>
            </div>
          </section>

          <InstallHelp />

          {/* Phones: what signing in unlocks, and youth protection, under the sign-in card */}
          <section className="card lg:hidden">
            <h2 className="section-title mb-2">Signing in unlocks</h2>
            <ul className="grid grid-cols-2 gap-2 text-xs font-semibold text-navy">
              {UNLOCKS.map((u) => (
                <li key={u.label} className="flex items-center gap-2 rounded-xl bg-surface-low p-2.5">
                  <u.icon className="h-4 w-4 text-pine" aria-hidden />
                  {u.label}
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-2 border-l-4 border-l-pine lg:hidden">
            <h2 className="flex items-center gap-1.5 font-extrabold text-pine-950">
              <ShieldCheck className="h-4 w-4 text-pine" aria-hidden /> Built around youth protection
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-xs text-ink marker:text-sage">
              {PROTECTION.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {safetyLink("text-pine")}
          </section>

          {help}
        </div>
      </main>
    </>
  );
}
