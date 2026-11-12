import type { Metadata } from "next";
import { Award, Images, Inbox, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/BackLink";
import { countWaitingJoins, requireAdmin } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { parsePilot } from "@/lib/pilot-rules";
import { getTwoStepPeople } from "@/lib/two-step";
import { getLastImport } from "@/lib/advancement-data";
import { timeAgo } from "@/lib/format";
import { nightlyProblem, storageUse } from "./admin-data";
import Tile from "./Tile";

export const metadata: Metadata = { title: "Pack admin" };

/** Pack admin: one button per area. Each area's tools and settings are on its own page. */
export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, waitingJoins, { count: openMessages }, storage, twoStep, problem, lastImport] = await Promise.all([
    getSettings(),
    countWaitingJoins(),
    supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null),
    storageUse(),
    getTwoStepPeople(),
    nightlyProblem(),
    getLastImport(),
  ]);
  const pilot = parsePilot(settings.pilot_only, settings.pilot_people);
  const notSetUp = (twoStep ?? []).filter((p) => p.signedUp && p.apps === 0).length;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <BackLink href="/lead" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack admin</h1>
      {problem && (
        <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">
          The nightly jobs (5 PM) had a problem {timeAgo(problem.at)}: {problem.steps.join(", ")}. Each job tries again the next
          evening; this goes away after a run with no problems. Details are in the Vercel logs.
        </p>
      )}

      <div className="space-y-2">
        <Tile
          big
          href="/admin/people"
          icon={UsersRound}
          label="Families and dens"
          sub="Join requests, families and scouts, roster check, dens, welcome emails, training"
          alert={waitingJoins ? `${plural(waitingJoins, "join request")} waiting` : null}
        />
        <Tile
          big
          href="/admin/advancement"
          icon={Award}
          label="Advancement"
          sub={`Import Scoutbook, approvals, awards · ${lastImport ? `imported ${timeAgo(lastImport.imported_at)}` : "never imported"}`}
        />
        <Tile
          big
          href="/admin/communication"
          icon={Inbox}
          label="Messages and newsletter"
          sub="Notes families send from the app, and the Sunday email"
          alert={openMessages ? `${plural(openMessages, "message")} open` : null}
        />
        <Tile
          big
          href="/admin/files"
          icon={Images}
          label="Photos and documents"
          sub={`Photo review, pack documents, storage · ${storage.percent}% of 1 GB used`}
          alert={storage.percent >= 80 ? "Storage getting full" : null}
        />
        <Tile
          big
          href="/admin/access"
          icon={ShieldCheck}
          label="Security and sign-in"
          sub="Two-step sign-in, report access, security log, terms of use"
          alert={notSetUp ? `${plural(notSetUp, "leader")} without two-step yet` : null}
        />
        <Tile
          big
          href="/admin/options"
          icon={SlidersHorizontal}
          label="App options"
          sub={`Pilot only (${pilot.on ? "on" : "off"}), TroopWebHost calendar, email and data settings`}
        />
      </div>
    </>
  );
}
