import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { brevoConfigured } from "@/lib/bulk-email";
import { NEWSLETTER_MODES, newsletterMode, testAdultIds, type NewsletterMode } from "@/lib/newsletter";
import { emailNewsletterPreview, saveNewsletterMode } from "../actions";
import Tile from "../Tile";

export const metadata: Metadata = { title: "Messages and newsletter" };

export default async function CommunicationPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, { count: openMessages }, { data: testerRows }] = await Promise.all([
    getSettings(),
    supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null),
    // People who can get the newsletter's test copy: key leaders, the Cubmaster and admins.
    supabase
      .from("adults")
      .select("id, first_name, preferred_name, last_name")
      .in("role", ["admin", "cubmaster", "committee"])
      .eq("is_active", true)
      .order("first_name"),
  ]);
  const testers = (testerRows ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string }[];
  const testIds = testAdultIds(settings.newsletter_test_adults);
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Messages and newsletter</h1>
      <Tile
        href="/admin/messages"
        icon={Inbox}
        label="Messages"
        sub="Problems and notes sent from the app"
        alert={openMessages ? `${openMessages} open` : null}
      />

      <section className="card space-y-3" id="newsletter">
        <h2 className="section-title">Weekly newsletter</h2>
        <p className="text-sm text-muted">
          Every Sunday morning each adult gets one email for their family: the next two weeks of events with their RSVP, anything
          waiting on them (RSVPs, money due, medical forms, registration), the week&apos;s announcements and open volunteer jobs.
        </p>
        <ActionForm action={saveNewsletterMode} submit="Save" buttonClass="btn-ghost w-full">
          <Field label="Who gets it" hint="While TroopWebHost still sends its own newsletter, keep it to testing.">
            <select className="input" name="newsletter_mode" defaultValue={newsletterMode(settings.newsletter_mode)}>
              {(Object.keys(NEWSLETTER_MODES) as NewsletterMode[]).map((m) => (
                <option key={m} value={m}>
                  {NEWSLETTER_MODES[m]}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="space-y-1">
            <legend className="text-xs font-bold text-navy">Test copy goes to</legend>
            {testers.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="tester" value={a.id} defaultChecked={testIds.includes(a.id)} className="h-4 w-4 accent-pine" />
                {a.preferred_name || a.first_name} {a.last_name}
              </label>
            ))}
          </fieldset>
        </ActionForm>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/admin/newsletter" className="btn-ghost py-2">
            See this week&apos;s
          </Link>
          <ActionForm action={emailNewsletterPreview} submit="Email it to me" busy="Sending…" buttonClass="btn-ghost w-full py-2" className="space-y-1" />
        </div>
        {!brevoConfigured() && settings.newsletter_mode === "everyone" && (
          <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">Sending to every family needs BREVO_API_KEY in Vercel.</p>
        )}
      </section>
    </>
  );
}
