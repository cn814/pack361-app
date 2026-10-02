import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import PostAnnouncement from "@/components/PostAnnouncement";
import { isLeader, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { packEmailConfigured } from "@/lib/bulk-email";

export const metadata: Metadata = { title: "Announce" };

/** Leader Home's quick actions: Announce (whole pack) and Message den. */
export default async function AnnouncePage({ searchParams }: PageProps<"/announce">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/");
  const { den } = await searchParams;
  const dens = await getMessageableDens(me);
  const chosen = typeof den === "string" ? dens.find((d) => d.id === den) : undefined;
  const toDen = den === "pick" || Boolean(chosen);
  const heading = chosen ? `Message ${chosen.name} families` : toDen ? "Message a den" : "Announce to the whole pack";
  const sub = chosen
    ? `Every family with a scout in ${chosen.name} gets it in the app (and by email if you tick it).`
    : toDen
      ? "Pick the den below. Only that den's families get it."
      : "Every family in the pack gets it in the app, with a phone alert, and by email if you tick it.";

  return (
    <>
      <BackLink href="/" label="Home" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{heading}</h1>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      <PostAnnouncement
        dens={dens}
        canPostPack
        defaultDen={chosen?.id ?? (toDen ? (dens[0]?.id ?? "") : "")}
        packEmail={packEmailConfigured()}
        startOpen
        doneHref="/inbox"
      />
    </>
  );
}
