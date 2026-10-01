import type { Metadata } from "next";
import { Plus, X } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { getAllAdults, getDenLeaders, getDens, requireAdmin, type RosterDen } from "@/lib/roster-data";
import { RANK_LABEL, RANKS } from "@/lib/advancement";
import { createClient } from "@/lib/supabase/server";
import { addDenLeader, removeDenLeader, saveDen } from "../actions";

export const metadata: Metadata = { title: "Dens" };

function DenFields({ den }: { den?: RosterDen }) {
  return (
    <>
      {den && <input type="hidden" name="id" value={den.id} />}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rank">
          <select className="input" name="rank" defaultValue={den?.rank ?? "lion"}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {RANK_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Den number">
          <input className="input" type="number" name="number" min={1} max={99} required defaultValue={den?.number ?? 1} />
        </Field>
      </div>
      <Field label="Meets">
        <input className="input" name="meeting_info" placeholder="Thursdays 6:30 PM, church basement" defaultValue={den?.meeting_info ?? ""} />
      </Field>
      {den && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="is_active" defaultChecked={den.is_active} className="h-4 w-4 accent-pine" />
          Active (uncheck after the den bridges or merges)
        </label>
      )}
    </>
  );
}

export default async function DensPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [dens, leaders, adults, { data: scoutRows }] = await Promise.all([
    getDens(),
    getDenLeaders(),
    getAllAdults(),
    supabase.from("scouts").select("den_id").eq("is_active", true),
  ]);
  const counts = new Map<string, number>();
  for (const s of scoutRows ?? []) if (s.den_id) counts.set(s.den_id as string, (counts.get(s.den_id as string) ?? 0) + 1);
  const people = adults.filter((a) => a.is_active);

  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Dens and den leaders</h1>

      {dens.map((d) => {
        const mine = leaders.filter((l) => l.den_id === d.id);
        return (
          <section key={d.id} className={`card space-y-2 ${d.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-extrabold text-pine-950">
                {d.name} <span className="text-xs font-semibold text-muted">Den {d.number}</span>
              </h2>
              <span className="text-xs text-muted">
                {counts.get(d.id) ?? 0} scouts{d.is_active ? "" : " · inactive"}
              </span>
            </div>
            {d.meeting_info && <p className="text-xs text-muted">{d.meeting_info}</p>}
            <ul className="space-y-1">
              {mine.length === 0 && <li className="text-sm text-gold-800">No den leader assigned</li>}
              {mine.map((l) => (
                <li key={l.adult_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-1.5 text-sm">
                  <span>
                    <span className="font-semibold text-ink">
                      {l.adult ? `${l.adult.preferred_name || l.adult.first_name} ${l.adult.last_name}` : "Unknown"}
                    </span>{" "}
                    <span className="text-xs text-muted">{l.title}</span>
                  </span>
                  <form action={removeDenLeader}>
                    <input type="hidden" name="den_id" value={d.id} />
                    <input type="hidden" name="adult_id" value={l.adult_id} />
                    <SubmitButton className="flex h-7 w-7 items-center justify-center rounded-full text-muted" aria-label="Remove">
                      <X className="h-4 w-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
                <Plus className="h-4 w-4" aria-hidden /> Add a den leader
              </summary>
              <div className="pt-2">
                <ActionForm action={addDenLeader} submit="Add" busy="Adding…">
                  <input type="hidden" name="den_id" value={d.id} />
                  <select className="input" name="adult_id" required defaultValue="" aria-label="Person">
                    <option value="" disabled>
                      Pick a person
                    </option>
                    {people.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.last_name}, {a.preferred_name || a.first_name}
                      </option>
                    ))}
                  </select>
                  <select className="input" name="title" defaultValue="Den Leader" aria-label="Title">
                    <option>Den Leader</option>
                    <option>Assistant Den Leader</option>
                  </select>
                  <p className="text-[11px] text-muted">Parents added here get den-leader access to the app.</p>
                </ActionForm>
              </div>
            </details>
            <details>
              <summary className="cursor-pointer list-none text-sm font-bold text-muted">Edit den</summary>
              <div className="pt-2">
                <ActionForm action={saveDen}>
                  <DenFields den={d} />
                </ActionForm>
              </div>
            </details>
          </section>
        );
      })}

      <details className="card">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add a den
        </summary>
        <div className="pt-3">
          <ActionForm action={saveDen} submit="Add den" busy="Adding…">
            <DenFields />
          </ActionForm>
        </div>
      </details>
    </>
  );
}
