import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { AdultFields } from "@/components/RosterForms";
import { getAdult, requireAdmin } from "@/lib/roster-data";
import { saveAdult } from "../../actions";

export const metadata: Metadata = { title: "Leader" };

export default async function AdultAdminPage({ params }: PageProps<"/admin/adults/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const adult = await getAdult(id);
  if (!adult) notFound();
  return (
    <>
      <BackLink href={adult.family_id ? `/admin/families/${adult.family_id}` : "/admin/roster"} label="Back" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">
        {adult.first_name} {adult.last_name}
      </h1>
      <section className="card">
        <ActionForm action={saveAdult}>
          <AdultFields adult={adult} />
        </ActionForm>
      </section>
    </>
  );
}
