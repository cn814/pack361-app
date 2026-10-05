import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import NatureTools from "@/components/NatureTools";
import { requireMember } from "@/lib/data";
import { PACK_HOME, plantIdReady } from "@/lib/nature-data";

export const metadata: Metadata = { title: "Nature ID" };

/** Bird sound ID and plant ID, for any time (event pages have them in their Trail guide too). */
export default async function NaturePage() {
  await requireMember();
  return (
    <>
      <BackLink href="/pack" label="Pack" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Nature ID</h1>
      <p className="-mt-1 text-sm text-muted">Hear a bird or find a plant? Find out what it is. Handy for hikes and nature adventures.</p>
      <section className="card">
        <NatureTools point={PACK_HOME} plantReady={plantIdReady()} />
      </section>
    </>
  );
}
