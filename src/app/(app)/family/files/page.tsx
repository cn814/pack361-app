import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import DeviceFiles from "@/components/DeviceFiles";
import { requireMember } from "@/lib/data";
import { getMyPaperwork } from "@/lib/paperwork";

export const metadata: Metadata = { title: "Saved on this phone" };

/**
 * A family's own copies of medical forms and insurance cards, kept only on this device.
 * The server only supplies who's in the family; the files never leave the browser.
 */
export default async function DeviceFilesPage({ searchParams }: PageProps<"/family/files">) {
  const me = await requireMember();
  const [{ people }, { person }] = await Promise.all([getMyPaperwork(me), searchParams]);
  const family = people.map((p) => ({ name: p.name, detail: p.kind === "scout" ? p.detail : "Adult" }));
  const wanted = typeof person === "string" ? person.slice(0, 80) : undefined;

  return (
    <>
      <BackLink href="/family" label="My family" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Saved on this phone</h1>
      <DeviceFiles ownerUserKey={me.id} familyKey={me.family_id ?? me.id} people={family} initialPerson={wanted} />
    </>
  );
}
