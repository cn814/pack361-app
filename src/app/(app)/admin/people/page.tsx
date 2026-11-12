import type { Metadata } from "next";
import { ListChecks, Mail, ShieldCheck, Tent, UserPlus, UsersRound } from "lucide-react";
import BackLink from "@/components/BackLink";
import { countWaitingJoins, requireAdmin, welcomeBudget } from "@/lib/roster-data";
import { emailConfigured } from "@/lib/email";
import Tile from "../Tile";

export const metadata: Metadata = { title: "Families and dens" };

export default async function PeoplePage() {
  await requireAdmin();
  const [waitingJoins, budget] = await Promise.all([countWaitingJoins(), welcomeBudget()]);
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Families and dens</h1>
      <div className="space-y-2">
        <Tile
          href="/admin/join"
          icon={UserPlus}
          label="Join requests"
          sub="People who signed in and asked to be added"
          alert={waitingJoins ? `${waitingJoins} waiting` : null}
        />
        <Tile href="/admin/roster" icon={UsersRound} label="Families and scouts" sub="Add families, change roles and dens, turn off access" />
        <Tile href="/admin/roster/check" icon={ListChecks} label="Roster check" sub="Compare with the Scoutbook roster: new scouts, den moves, who left" />
        <Tile href="/admin/dens" icon={Tent} label="Dens and den leaders" sub="Add dens, assign leaders" />
        <Tile
          href="/admin/welcome"
          icon={Mail}
          label="Welcome emails"
          sub={emailConfigured() ? `Tell families the app is ready · ${budget.sentToday} of ${budget.limit} sent today` : "Needs the email key in Vercel"}
        />
        <Tile href="/leaders/training" icon={ShieldCheck} label="Leader training" sub="Youth Protection and other courses, and the monthly import" />
      </div>
    </>
  );
}
