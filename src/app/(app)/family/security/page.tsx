import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import TwoStepCard from "@/components/TwoStepCard";
import { needsTwoStep, requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default async function SecurityPage() {
  const me = await requireMember();
  if (!needsTwoStep(me.real_role ?? me.role)) redirect("/family");
  return (
    <>
      <BackLink href="/family" label="Me" />
      <TwoStepCard />
    </>
  );
}
