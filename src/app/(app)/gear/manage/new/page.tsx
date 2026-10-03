import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import GearItemForm from "@/components/GearItemForm";
import { isLeader, requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Add gear" };

export default async function NewGearPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/gear");
  return (
    <>
      <BackLink href="/gear/manage" label="Manage gear" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Add gear</h1>
      <GearItemForm />
    </>
  );
}
