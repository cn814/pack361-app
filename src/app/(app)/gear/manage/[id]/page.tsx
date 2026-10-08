import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import GearItemForm from "@/components/GearItemForm";
import { isGearKeeper, requireMember } from "@/lib/data";
import { getGearItem } from "@/lib/gear";

export const metadata: Metadata = { title: "Edit gear" };

export default async function EditGearPage({ params }: PageProps<"/gear/manage/[id]">) {
  const me = await requireMember();
  if (!isGearKeeper(me)) redirect("/gear");
  const { id } = await params;
  const item = await getGearItem(id);
  if (!item) notFound();
  return (
    <>
      <BackLink href="/gear/manage" label="Manage gear" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{item.name}</h1>
      <p className="-mt-1 text-sm text-muted">
        {item.available} of {item.quantity} free right now. To stop lending it, untick the box at the bottom.
      </p>
      <GearItemForm item={item} />
    </>
  );
}
