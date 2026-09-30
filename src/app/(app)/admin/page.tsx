import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, Images, Inbox, Mail, ShieldCheck, Tent, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { requireAdmin, welcomeBudget } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { saveSettings } from "./actions";

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
  const [settings, budget, { count: openMessages }] = await Promise.all([
    getSettings(),
    welcomeBudget(),
    supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);
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
        <Tile href="/photos/review" icon={Images} label="Photo review" sub="Approve uploads, handle removal requests" />
        <Tile href="/scouts/import" icon={FileUp} label="Import Scoutbook" sub="Advancement export from Scoutbook Plus" />
      </div>

      <section className="card space-y-3">
        <h2 className="section-title">Pack settings</h2>
        <ActionForm action={saveSettings}>
          <Field label="Track awards earned on or after" hint="Anything earned before this date counts as already handed out.">
            <input className="input" type="date" name="awards_tracked_from" defaultValue={settings.awards_tracked_from} />
          </Field>
          <Field label="Keep photos for (months)" hint="Photos older than this are deleted automatically.">
            <input className="input" type="number" min={1} max={120} name="photo_keep_months" defaultValue={settings.photo_keep_months} />
          </Field>
          <Field label="Emails per day" hint="The free email plan allows 100 a day, including sign-in codes. Keep some room for those.">
            <input className="input" type="number" min={0} max={1000} name="email_daily_limit" defaultValue={settings.email_daily_limit} />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
