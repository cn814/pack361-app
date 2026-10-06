import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Camera, CircleAlert, Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { AdultFields, ScoutFields } from "@/components/RosterForms";
import { getDens, getFamily, getSignIns, requireAdmin, ROLE_LABEL } from "@/lib/roster-data";
import { fmtDay } from "@/lib/format";
import { saveAdult, saveFamily, saveScout } from "../../actions";

export const metadata: Metadata = { title: "Family" };

export default async function FamilyAdminPage({ params, searchParams }: PageProps<"/admin/families/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { note } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [family, dens, signIns] = await Promise.all([getFamily(id), getDens(), getSignIns()]);
  if (!family) notFound();

  return (
    <>
      <BackLink href="/admin/roster" label="Families" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{family.family_name} family</h1>
      {note === "adult" && (
        <p className="flex items-center gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden /> The family was added, but the parent wasn&apos;t: someone on
          the roster already uses that email.
        </p>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">Adults</h2>
        {family.adults.length === 0 && <p className="text-sm text-muted">No adults yet, so no one in this family can sign in.</p>}
        {family.adults
          .sort((a, b) => Number(b.is_active) - Number(a.is_active))
          .map((a) => {
            const last = signIns.get(a.id);
            return (
              <details key={a.id} className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer list-none">
                  <span className={`block font-semibold ${a.is_active ? "text-ink" : "text-muted line-through"}`}>
                    {a.first_name} {a.last_name}
                    {a.role !== "parent" && <span className="badge ml-2 bg-mint text-pine">{ROLE_LABEL[a.role]}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {a.email} · {last ? `last signed in ${fmtDay(last)}` : a.welcomed_at ? "welcomed, hasn't signed in" : "hasn't signed in"}
                  </span>
                </summary>
                <div className="pt-3">
                  <ActionForm action={saveAdult}>
                    <AdultFields adult={a} familyId={family.id} />
                  </ActionForm>
                </div>
              </details>
            );
          })}
        <details className="pt-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
            <Plus className="h-4 w-4" aria-hidden /> Add a parent or guardian
          </summary>
          <div className="pt-3">
            <ActionForm action={saveAdult} submit="Add adult" busy="Adding…">
              <AdultFields familyId={family.id} />
            </ActionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Scouts</h2>
        {family.scouts.length === 0 && <p className="text-sm text-muted">No scouts yet.</p>}
        {family.scouts
          .sort((a, b) => Number(b.is_active) - Number(a.is_active))
          .map((s) => (
            <details key={s.id} className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer list-none">
                <span className={`block font-semibold ${s.is_active ? "text-ink" : "text-muted line-through"}`}>
                  {s.first_name} {s.last_name}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {s.den?.name ?? "No den"} ·
                  <Camera className="h-3 w-3" aria-hidden />
                  {s.photo_permission === "no" ? "no photos (opted out)" : `photos OK · Facebook ${s.social_ok ? "yes" : s.social_ok === false ? "no" : "not answered"}`}
                </span>
              </summary>
              <div className="pt-3">
                <ActionForm action={saveScout}>
                  <ScoutFields scout={s} familyId={family.id} dens={dens} />
                </ActionForm>
              </div>
            </details>
          ))}
        <details className="pt-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
            <Plus className="h-4 w-4" aria-hidden /> Add a scout
          </summary>
          <div className="pt-3">
            <ActionForm action={saveScout} submit="Add scout" busy="Adding…">
              <ScoutFields familyId={family.id} dens={dens} />
            </ActionForm>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Family</h2>
        <ActionForm action={saveFamily}>
          <input type="hidden" name="id" value={family.id} />
          <Field label="Family name">
            <input className="input" name="family_name" required defaultValue={family.family_name} />
          </Field>
          <label className="flex items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="is_active" defaultChecked={family.is_active} className="mt-0.5 h-4 w-4 accent-pine" />
            <span>
              Active in the pack
              <span className="block text-xs font-normal text-muted">
                Unchecking this turns off the family&apos;s scouts and parent sign-ins. Leaders in the family keep access.
              </span>
            </span>
          </label>
        </ActionForm>
      </section>
    </>
  );
}
