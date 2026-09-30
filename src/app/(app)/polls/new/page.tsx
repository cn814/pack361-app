import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import PollForm from "@/components/PollForm";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";

export const metadata: Metadata = { title: "New poll" };

export default async function NewPollPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/polls");
  const dens = await getMessageableDens(me);
  return (
    <>
      <BackLink href="/polls" label="Polls" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">New poll</h1>
      <section className="card">
        <PollForm dens={dens} canPollPack={isCommittee(me) || me.role === "den_leader"} />
      </section>
    </>
  );
}
