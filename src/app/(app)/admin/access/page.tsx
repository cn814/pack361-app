import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/BackLink";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { TERMS_VERSION } from "@/lib/policies";
import { getTwoStepPeople } from "@/lib/two-step";
import { timeAgo } from "@/lib/format";
import { resetTwoStep } from "../actions";
import Tile from "../Tile";

export const metadata: Metadata = { title: "Security and sign-in" };

export default async function AccessPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [twoStep, { count: adultsActive }, { count: adultsAgreed }] = await Promise.all([
    getTwoStepPeople(),
    supabase.from("adults").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("adults").select("id", { count: "exact", head: true }).eq("is_active", true).gte("terms_version", TERMS_VERSION),
  ]);
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Security and sign-in</h1>

      <section className="card space-y-3" id="two-step">
        <h2 className="section-title">Two-step sign-in</h2>
        <p className="text-sm text-muted">
          Every leader (den leaders, key leaders, the Cubmaster and admins) signs in with their email code <b>and</b> a code from an authenticator app.
          Anyone who hasn&apos;t set it up is walked through it the next time they open the app; until then they get only a
          parent&apos;s access. Someone lost their phone? Reset them: they&apos;re signed out and set up their app again.
        </p>
        {twoStep === null ? (
          <p className="text-sm text-gold-800">Needs the server key (SUPABASE_SECRET_KEY) to show who&apos;s set up.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {twoStep.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {!p.signedUp
                      ? "Hasn't signed in yet"
                      : p.apps === 0
                        ? "Not set up yet"
                        : `Set up · ${p.apps} app${p.apps === 1 ? "" : "s"}${p.lastUsed ? ` · last code ${timeAgo(p.lastUsed)}` : ""}`}
                  </span>
                </span>
                {p.apps > 0 ? (
                  <ActionForm
                    action={resetTwoStep}
                    submit="Reset"
                    busy="Resetting…"
                    className="flex flex-col items-end text-right"
                    buttonClass="text-xs font-bold text-danger underline"
                    confirm={`Reset ${p.name}'s two-step sign-in? They'll be signed out everywhere and set up their authenticator app again.`}
                  >
                    <input type="hidden" name="adult_id" value={p.id} />
                  </ActionForm>
                ) : (
                  <span className={`badge ${p.signedUp ? "bg-gold-50 text-gold-800" : "bg-surface-low text-muted"}`}>
                    {p.signedUp ? "To do" : "—"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        <Tile
          href="/admin/reports"
          icon={ListChecks}
          label="Report access"
          sub="Who else can open the roster and membership reports, and who helps with Facebook photos"
        />
        <Tile href="/admin/security" icon={ScrollText} label="Security log" sub="Who changed anyone's access, and who downloaded pack spreadsheets" />
      </div>

      <section className="card space-y-1">
        <h2 className="section-title">Terms of use</h2>
        <p className="text-sm text-muted">
          Version {TERMS_VERSION}: {adultsAgreed ?? 0} of {adultsActive ?? 0} people on the roster have agreed. Everyone agrees at
          their first sign-in, and again when the version changes.{" "}
          <Link className="font-semibold text-pine underline" href="/terms">
            Terms
          </Link>{" "}
          ·{" "}
          <Link className="font-semibold text-pine underline" href="/privacy">
            Data policy
          </Link>
        </p>
      </section>
    </>
  );
}
