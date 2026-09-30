import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, Images, Inbox, Mail, ShieldCheck, Tent, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { requireAdmin, welcomeBudget } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { saveSettings, syncTroopWebHost } from "./actions";
import { twhConfigured } from "@/lib/twh";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Pack admin" };

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
  const [settings, budget, { count: openMessages }, { data: photoBytes }] = await Promise.all([
    getSettings(),
    welcomeBudget(),
    supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supabase.rpc("photo_storage_bytes"),
  ]);
  // Supabase's free plan includes 1 GB of file storage.
  const photoMb = Math.round(Number(photoBytes ?? 0) / 1e6);
  const photoPct = Math.round((Number(photoBytes ?? 0) / 1e9) * 100);
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
  const lastRun = read<{ at: string; ok: boolean; failed: string[] }>("daily_last_run");
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
          sub={`Approve uploads, handle removal requests · ${photoMb} MB of 1 GB storage used (${photoPct}%)`}
        />
        <Tile href="/scouts/import" icon={FileUp} label="Import Scoutbook" sub="Advancement export from Scoutbook Plus" />
      </div>

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
            {lastRun && !lastRun.ok && (
              <p className="rounded-xl bg-danger-50 p-2 text-xs text-danger">
                The nightly jobs had a problem {timeAgo(lastRun.at)}: {lastRun.failed.join(", ")}. Check the Vercel logs.
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
            hint="The free email plan allows 100 emails a day in total. Each family you welcome then signs in (another email), so 40 a day leaves room for their sign-ins and reminders."
          >
            <input className="input" type="number" min={0} max={1000} name="email_daily_limit" defaultValue={settings.email_daily_limit} />
          </Field>
          <Field label="Dues season" hint="Like 2026-27. Families see their dues for this season on My family.">
            <input className="input" name="dues_season" defaultValue={settings.dues_season} placeholder="2026-27" />
          </Field>
          <Field label="Dues amount" hint="Shown to families, e.g. “$60 per scout, due Oct 31”. Leave blank to hide dues.">
            <input className="input" name="dues_amount" maxLength={200} defaultValue={settings.dues_amount} />
          </Field>
          <Field label="How to pay dues" hint="Instructions or a link, shown under the amount.">
            <textarea className="input min-h-16" name="dues_how" maxLength={600} defaultValue={settings.dues_how} />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
