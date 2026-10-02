import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import ViewAsPicker from "@/components/ViewAsPicker";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "See the app as" };

export default async function ViewAsPage() {
  const me = await requireMember();
  return (
    <>
      <BackLink href="/family" label="Me" />
      <ViewAsPicker me={me} />
    </>
  );
}
