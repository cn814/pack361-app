import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, Files, Images, Inbox, Mail, ShieldCheck, Tent, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { requireAdmin, welcomeBudget } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { emailNewsletterPreview, saveNewsletterMode, saveSettings, syncTroopWebHost } from "./actions";
import { brevoConfigured } from "@/lib/bulk-email";
import { NEWSLETTER_MODES, type NewsletterMode } from "@/lib/newsletter";
import { twhConfigured } from "@/lib/twh";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Pack admin" };

const startedOver = (at: string, minutes: number) => Date.parse(at) < Date.now() - minutes * 60000;

function Tile({ href, icon: Icon, label, sub }: { href: string; icon: typeof Mail; label: string; sub: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 py-3">
      <Icon className="h-6 w-6 shrink-0 text-pine" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-pine-950">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
    </Link>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, budget, { count: openMessages }, { data: storageRows }] = await Promise.all([
    getSettings(),
    welcomeBudget(),
    supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supabase.rpc("storage_usage"),
  ]);
  // Supabase's free plan includes 1 GB of file storage, shared by every bucket.
  const usage = (storageRows ?? []) as { bucket_id: string; bytes: number }[];
  const bytesIn = (bucket: string) => Number(usage.find((u) => u.bucket_id === bucket)?.bytes ?? 0);
  const photoBytes = bytesIn("pack-photos");
  const docBytes = bytesIn("pack-docs");
  const totalBytes = usage.reduce((n, u) => n + Number(u.bytes), 0);
  const otherBytes = Math.max(0, totalBytes - photoBytes - docBytes);
  const pct = (n: number) => Math.min(100, (n / 1e9) * 100);
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
  const { data: runRows } = await supabase.from("pack_settings").select("key, value").in("key", ["twh_last_sync", "daily_last_run"]);
  const read = <T,>(key: string): T | null => {
    try {
      const v = runRows?.find((r) => r.key === key)?.value;
      return v ? (JSON.parse(v as string) as T) : null;
    } catch {
      return null;
    }
  };
  const lastSync = read<{ at: string; feed: number; skipped?: string; errors?: string[] }>("twh_last_sync");
  const lastRun = read<{ at: string; ok: boolean; failed: string[]; running?: string | null }>("daily_last_run");
  // A run still "running" well past the 5-minute limit was cut off in that step.
  const cutOff = lastRun?.running && startedOver(lastRun.at, 10) ? lastRun.running : null;
  const runProblem = lastRun && (cutOff || (!lastRun.running && !lastRun.ok)) ? [...lastRun.failed, ...(cutOff ? [`${cutOff} (didn't finish)`] : [])] : null;
  return (
    <>
      <BackLink href="/leaders" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack admin</h1>

      <div className="space-y-2">
        <Tile
          href="/admin/messages"
          icon={Inbox}
          label={openMessages ? `Messages (${openMessages} open)` : "Messages"}
          sub="Problems and notes sent from the app"
        />
        <Tile href="/admin/roster" icon={UsersRound} label="Families and scouts" sub="Add families, change dens, turn off access" />
        <Tile href="/admin/dens" icon={Tent} label="Dens and den leaders" sub="Add dens, assign leaders" />
        <Tile
          href="/admin/welcome"
          icon={Mail}
          label="Welcome emails"
          sub={emailConfigured() ? `${budget.sentToday} of ${budget.limit} sent today` : "Needs the email key in Vercel"}
        />
        <Tile href="/leaders/training" icon={ShieldCheck} label="Leader training" sub="Youth Protection and other courses" />
        <Tile
          href="/photos/review"
          icon={Images}
          label="Photo review"
          sub={`Approve uploads, handle removal requests · ${mb(photoBytes)} of photos`}
        />
        <Tile href="/documents" icon={Files} label="Pack documents" sub={`Forms, minutes and pack papers · ${mb(docBytes)} of files`} />
        <Tile href="/scouts/import" icon={FileUp} label="Import Scoutbook" sub="Advancement export from Scoutbook Plus" />
      </div>

      <section className="card space-y-2">
        <h2 className="section-title">File storage</h2>
        <p className="text-sm text-muted">
          {mb(totalBytes)} of the free 1 GB used ({Math.round(pct(totalBytes))}%).
          {pct(totalBytes) >= 80 && " Getting full: delete old photos or documents, or shorten how long photos are kept."}
        </p>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-surface"
          role="img"
          aria-label={`Photos ${mb(photoBytes)}, documents ${mb(docBytes)}, of 1 GB`}
        >
          <span className="bg-pine" style={{ width: `${pct(photoBytes)}%` }} />
          <span className="bg-gold" style={{ width: `${pct(docBytes)}%` }} />
          <span className="bg-sage" style={{ width: `${pct(otherBytes)}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-pine" aria-hidden /> Photos {mb(photoBytes)}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden /> Documents {mb(docBytes)}
          </li>
          {otherBytes > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sage" aria-hidden /> Other files {mb(otherBytes)}
            </li>
          )}
        </ul>
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
            {lastRun && runProblem && (
              <p className="rounded-xl bg-danger-50 p-2 text-xs text-danger">
                The nightly jobs had a problem {timeAgo(lastRun.at)}: {runProblem.join(", ")}. Check the Vercel logs.
              </p>
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

      <section className="card space-y-3" id="newsletter">
        <h2 className="section-title">Weekly newsletter</h2>
        <p className="text-sm text-muted">
          Every Sunday morning each adult gets one email for their family: the next two weeks of events with their RSVP, anything
          waiting on them (RSVPs, money due, medical forms, registration), the week&apos;s announcements and open volunteer jobs.
        </p>
        <ActionForm action={saveNewsletterMode} submit="Save" buttonClass="btn-ghost w-full">
          <Field label="Who gets it" hint="While TroopWebHost still sends its own newsletter, keep it to pack admins.">
            <select className="input" name="newsletter_mode" defaultValue={settings.newsletter_mode}>
              {(Object.keys(NEWSLETTER_MODES) as NewsletterMode[]).map((m) => (
                <option key={m} value={m}>
                  {NEWSLETTER_MODES[m]}
                </option>
              ))}
            </select>
          </Field>
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

      <section className="card space-y-3">
        <h2 className="section-title">Pack settings</h2>
        <ActionForm action={saveSettings}>
          <Field label="Track awards earned on or after" hint="Anything earned before this date counts as already handed out.">
            <input className="input" type="date" name="awards_tracked_from" defaultValue={settings.awards_tracked_from} />
          </Field>
          <Field label="Keep photos for (months)" hint="Photos older than this are deleted automatically.">
            <input className="input" type="number" min={1} max={120} name="photo_keep_months" defaultValue={settings.photo_keep_months} />
          </Field>
          <Field
            label="Welcome emails per day"
            hint="The free email plan allows 100 emails a day in total, shared by welcome emails, sign-in codes and up to 40 nightly reminder emails (most reminders go to phones instead). Each family you welcome then signs in, which is another email, so 40 welcomes a day can crowd out sign-in codes on a heavy reminder day. 30 is safer."
          >
            <input className="input" type="number" min={0} max={1000} name="email_daily_limit" defaultValue={settings.email_daily_limit} />
          </Field>
        </ActionForm>
        <p className="text-[11px] text-muted">
          {settings.registration_billing === "on" ? "Dues, registration fee amounts" : "Dues"} and other ways to pay are on{" "}
          <Link href="/leaders/money?tab=settings" className="font-semibold text-pine underline">
            Leaders → Money
          </Link>
          .
        </p>
      </section>
    </>
  );
}
