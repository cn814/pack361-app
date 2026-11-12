import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { parsePilot } from "@/lib/pilot-rules";
import { twhConfigured } from "@/lib/twh";
import { timeAgo } from "@/lib/format";
import { savePilot, saveSettings, syncTroopWebHost } from "../actions";
import { jobRuns } from "../admin-data";

export const metadata: Metadata = { title: "App options" };

export default async function OptionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, { lastSync, lastRun }, { data: parentRows }] = await Promise.all([
    getSettings(),
    jobRuns(),
    // Pilot only: parents who can be let in before the app is open to everyone.
    supabase.from("adults").select("id, first_name, preferred_name, last_name").eq("role", "parent").eq("is_active", true).order("last_name").order("first_name"),
  ]);
  const pilot = parsePilot(settings.pilot_only, settings.pilot_people);
  const pilotParents = ((parentRows ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string }[]).sort(
    (a, b) => Number(pilot.people.has(b.id)) - Number(pilot.people.has(a.id)),
  );
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">App options</h1>

      <section className="card space-y-3" id="pilot">
        <h2 className="section-title">Pilot only</h2>
        <p className="text-sm text-muted">
          Until the pack committee adopts the app, only leaders (den leaders, key leaders, the Cubmaster and admins) and the people
          ticked below can use it. Everyone else who signs in sees a &ldquo;coming shortly&rdquo; page, and the app&apos;s emails,
          phone alerts and calendar feeds skip them. Turn it off after the vote.
        </p>
        <p className={`rounded-xl p-2 text-sm font-semibold ${pilot.on ? "bg-gold-50 text-gold-800" : "bg-mint text-pine"}`}>
          {pilot.on ? "On: leaders and the people ticked below only." : "Off: open to every family on the roster."}
        </p>
        <ActionForm action={savePilot} submit="Save" buttonClass="btn-ghost w-full" className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="pilot_only" defaultChecked={pilot.on} className="h-4 w-4 accent-pine" />
            Pilot only
          </label>
          <details open={pilot.people.size > 0}>
            <summary className="cursor-pointer text-xs font-bold text-navy">Parents let in during the pilot ({pilot.people.size} picked)</summary>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
              {pilotParents.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="pilot_person" value={a.id} defaultChecked={pilot.people.has(a.id)} className="h-4 w-4 accent-pine" />
                  {a.preferred_name || a.first_name} {a.last_name}
                </label>
              ))}
            </div>
          </details>
        </ActionForm>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">TroopWebHost calendar</h2>
        {twhConfigured() ? (
          <>
            <p className="text-sm text-muted">
              Events sync from TroopWebHost every afternoon.{" "}
              {lastSync ? `Last sync ${timeAgo(lastSync.at)} (${lastSync.feed} events).` : "Not synced yet."} Events removed in
              TroopWebHost move to the archive; nothing is deleted.
            </p>
            {(lastSync?.skipped || lastSync?.errors?.length) && (
              <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">{[lastSync.skipped, ...(lastSync.errors ?? [])].filter(Boolean).join(" ")}</p>
            )}
            <ActionForm action={syncTroopWebHost} submit="Sync now" busy="Syncing…" buttonClass="btn-ghost w-full" />
          </>
        ) : (
          <p className="text-sm text-gold-800">
            Not connected. In TroopWebHost, open My Stuff → Subscribe to Calendar, copy the link, and add it in Vercel as
            TWH_CALENDAR_URL (Secret, Production). Then redeploy.
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Email, links and keeping data</h2>
        <ActionForm action={saveSettings}>
          <Field
            label="Welcome emails per day"
            hint="The free email plan allows 100 emails a day in total, shared by welcome emails, sign-in codes and up to 40 nightly reminder emails (most reminders go to phones instead). Each family you welcome then signs in, which is another email, so 40 welcomes a day can crowd out sign-in codes on a heavy reminder day. 30 is safer."
          >
            <input className="input" type="number" min={0} max={1000} name="email_daily_limit" defaultValue={settings.email_daily_limit} />
          </Field>
          <Field label="The pack's public page" hint="The link Invite a family shares. Change it to https://pack361.org once that address points to the app.">
            <input className="input" type="url" name="public_site_url" defaultValue={settings.public_site_url} />
          </Field>
          <Field
            label="Keep contact details of families who left for (months)"
            hint="After this, their email, phone and sign-in are cleared automatically. Names, scouts and advancement stay. The pack's data policy sets this (24 months)."
          >
            <input className="input" type="number" min={6} max={120} name="left_family_months" defaultValue={settings.left_family_months} />
          </Field>
        </ActionForm>
        <p className="text-[11px] text-muted">
          {settings.registration_billing === "on" ? "Dues, registration fee amounts" : "Dues"} and other ways to pay are on{" "}
          <Link href="/leaders/money?tab=settings" className="font-semibold text-pine underline">
            Leaders → Money
          </Link>
          . How long photos are kept is on Photos and documents.
        </p>
      </section>

      {lastRun && (
        <p className="text-center text-[11px] text-muted">
          Nightly jobs last ran {timeAgo(lastRun.at)}
          {lastRun.ok ? ", no problems." : "."}
        </p>
      )}
    </>
  );
}
