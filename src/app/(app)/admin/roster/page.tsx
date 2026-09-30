import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { AdultFields } from "@/components/RosterForms";
import { getAdultsWithoutFamily, getDens, getFamilies, requireAdmin, ROLE_LABEL } from "@/lib/roster-data";
import { saveAdult, saveFamily } from "../actions";

export const metadata: Metadata = { title: "Families and scouts" };

export default async function RosterPage({ searchParams }: PageProps<"/admin/roster">) {
  await requireAdmin();
  const { q: rawQ } = await searchParams;
  const q = (typeof rawQ === "string" ? rawQ : "").trim().toLowerCase();
  const [families, loners, dens] = await Promise.all([getFamilies(), getAdultsWithoutFamily(), getDens(false)]);

  const match = (f: (typeof families)[number]) =>
    !q ||
    f.family_name.toLowerCase().includes(q) ||
    f.adults.some((a) => `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)) ||
    f.scouts.some((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));
  const shown = families.filter(match);
  const active = shown.filter((f) => f.is_active);
  const inactive = shown.filter((f) => !f.is_active);
  const scoutCount = families.filter((f) => f.is_active).reduce((n, f) => n + f.scouts.filter((s) => s.is_active).length, 0);

  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Families and scouts</h1>
        <p className="text-sm text-muted">
          {families.filter((f) => f.is_active).length} active families · {scoutCount} scouts
        </p>
      </div>

      <form className="relative" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" type="search" name="q" defaultValue={q} placeholder="Search families, parents, scouts" />
      </form>

      <details className="card">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add a family
        </summary>
        <div className="pt-3">
          <ActionForm action={saveFamily} submit="Add family" busy="Adding…">
            <Field label="Family name">
              <input className="input" name="family_name" required placeholder="Smith" />
            </Field>
            <p className="pt-1 text-xs font-bold text-navy">First parent or guardian (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" name="adult_first_name" placeholder="First name" aria-label="Parent first name" />
              <input className="input" name="adult_last_name" placeholder="Last name" aria-label="Parent last name" />
            </div>
            <input className="input" type="email" name="adult_email" placeholder="Email they'll sign in with" aria-label="Parent email" />
            <p className="pt-1 text-xs font-bold text-navy">First scout (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" name="scout_first_name" placeholder="First name" aria-label="Scout first name" />
              <input className="input" name="scout_last_name" placeholder="Last name" aria-label="Scout last name" />
            </div>
            <select className="input" name="scout_den_id" defaultValue="" aria-label="Scout's den">
              <option value="">Den (pick later)</option>
              {dens.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </ActionForm>
        </div>
      </details>

      <section className="space-y-2">
        {active.length === 0 && <p className="card text-sm text-muted">No families match “{q}”.</p>}
        {active.map((f) => (
          <FamilyRow key={f.id} f={f} />
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Leaders without a scout in the pack</h2>
        <ul className="divide-y divide-line">
          {loners
            .filter((a) => !q || `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q))
            .map((a) => (
              <li key={a.id}>
                <Link href={`/admin/adults/${a.id}`} className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${a.is_active ? "text-ink" : "text-muted line-through"}`}>
                      {a.first_name} {a.last_name}
                    </span>
                    <span className="block truncate text-xs text-muted">{a.position_title ?? ROLE_LABEL[a.role]}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
            <Plus className="h-4 w-4" aria-hidden /> Add a leader without a scout
          </summary>
          <div className="pt-3">
            <ActionForm action={saveAdult} submit="Add leader" busy="Adding…">
              <AdultFields />
            </ActionForm>
          </div>
        </details>
      </section>

      {inactive.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer list-none text-sm font-bold text-muted">
            Former families ({inactive.length})
          </summary>
          <div className="space-y-2 pt-3">
            {inactive.map((f) => (
              <FamilyRow key={f.id} f={f} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function FamilyRow({ f }: { f: Awaited<ReturnType<typeof getFamilies>>[number] }) {
  const scouts = f.scouts.filter((s) => s.is_active || !f.is_active);
  const adults = f.adults.filter((a) => a.is_active || !f.is_active);
  const noEmail = f.is_active && adults.length === 0;
  return (
    <Link href={`/admin/families/${f.id}`} className="card flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${f.is_active ? "text-pine-950" : "text-muted"}`}>{f.family_name}</span>
        <span className="block truncate text-xs text-muted">
          {adults.map((a) => a.preferred_name || a.first_name).join(", ") || "No adults"}
        </span>
        <span className="block truncate text-xs text-navy">
          {scouts.map((s) => `${s.first_name}${s.den ? ` (${s.den.name.replace(" Den ", " ")})` : ""}`).join(", ") || "No scouts"}
        </span>
        {noEmail && <span className="badge mt-1 bg-danger-50 text-danger">No one can sign in</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
