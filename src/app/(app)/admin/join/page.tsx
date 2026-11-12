import type { Metadata } from "next";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { getDens, getJoinRequests, requireAdmin, type RosterDen } from "@/lib/roster-data";
import { denForGrade, GRADE_LABEL, type JoinRequest } from "@/lib/join";
import { emailConfigured } from "@/lib/email";
import { timeAgo } from "@/lib/format";
import { approveJoin, declineJoin } from "../actions";

export const metadata: Metadata = { title: "Join requests" };

type Fam = { id: string; family_name: string; is_active: boolean };

function RequestCard({ r, families, dens }: { r: JoinRequest; families: Fam[]; dens: RosterDen[] }) {
  const sameName = families.filter((f) => f.family_name.toLowerCase() === r.last_name.toLowerCase());
  const canEmail = emailConfigured();
  return (
    <article className="card space-y-3">
      <header className="space-y-0.5">
        <p className="font-extrabold text-pine-950">
          {r.first_name} {r.last_name}
          {r.relationship && <span className="text-sm font-semibold text-muted"> · {r.relationship}</span>}
        </p>
        <p className="text-xs text-muted">
          {r.email}
          {r.phone && ` · ${r.phone}`} · asked {timeAgo(r.created_at)}
        </p>
        {r.note && <p className="rounded-lg bg-surface-low p-2 text-xs text-navy">{r.note}</p>}
      </header>

      <ActionForm action={approveJoin} submit="Add to the roster" busy="Adding…">
        <input type="hidden" name="id" value={r.id} />
        <Field label="Family" hint={sameName.length ? `There's already a ${r.last_name} family. Pick it if they're the same family.` : undefined}>
          <select className="input" name="family_id" defaultValue="">
            <option value="">New family</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family_name}
                {f.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="New family's name">
          <input className="input" name="family_name" defaultValue={r.last_name} maxLength={80} />
        </Field>
        {r.scouts.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-navy">Scouts (untick any already on the roster)</legend>
            {r.scouts.map((s, i) => {
              const den = denForGrade(s.grade, dens);
              return (
                <div key={i} className="space-y-1.5 rounded-xl bg-surface-low p-2">
                  <input type="hidden" name="scout" value={i} />
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input type="checkbox" name={`keep_${i}`} defaultChecked className="h-4 w-4 accent-pine" />
                    Add this scout
                    {s.grade && <span className="text-xs font-normal text-muted">· {GRADE_LABEL[s.grade]}</span>}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="input py-2" name={`first_${i}`} defaultValue={s.first_name} aria-label="First name" maxLength={60} />
                    <input className="input py-2" name={`last_${i}`} defaultValue={s.last_name} aria-label="Last name" maxLength={60} />
                  </div>
                  <select className="input py-2" name={`den_${i}`} defaultValue={den?.id ?? ""} aria-label="Den">
                    <option value="">Den (pick later)</option>
                    {dens.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </fieldset>
        )}
        {canEmail && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="email" defaultChecked className="h-4 w-4 accent-pine" /> Email them that they&apos;re in
          </label>
        )}
      </ActionForm>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-muted">Decline</summary>
        <ActionForm action={declineJoin} submit="Decline" busy="Saving…" buttonClass="btn-ghost w-full" className="space-y-2 pt-2">
          <input type="hidden" name="id" value={r.id} />
          <Field label="Why (they'll see this)">
            <input className="input" name="reason" maxLength={500} placeholder="For example: we couldn't find you in the pack's records" />
          </Field>
          {canEmail && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="email" defaultChecked className="h-4 w-4 accent-pine" /> Email them
            </label>
          )}
        </ActionForm>
      </details>
    </article>
  );
}

export default async function JoinRequestsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ waiting, recent }, dens, { data: famRows }] = await Promise.all([
    getJoinRequests(),
    getDens(false),
    supabase.from("families").select("id, family_name, is_active").order("family_name"),
  ]);
  const families = (famRows ?? []) as Fam[];
  const famName = new Map(families.map((f) => [f.id, f.family_name]));

  return (
    <>
      <BackLink href="/admin/people" label="Families and dens" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Join requests</h1>
        <p className="text-sm text-muted">
          People who signed in with an email that isn&apos;t on the roster and asked to be added. Check they&apos;re a pack
          family (Scoutbook, or the den leader) before you add them. Scouts&apos; names are deleted from the request once
          you answer it.
        </p>
      </div>

      <section className="page-wide space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
        {waiting.length === 0 && <p className="card text-sm text-muted">Nobody is waiting.</p>}
        {waiting.map((r) => (
          <RequestCard key={r.id} r={r} families={families} dens={dens} />
        ))}
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Answered</h2>
          <ul className="card divide-y divide-line py-1 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 py-2">
                <span className="min-w-0">
                  <b className="text-ink">
                    {r.first_name} {r.last_name}
                  </b>
                  <span className="text-xs text-muted">
                    {" "}
                    · {r.status === "approved" ? `added${r.family_id && famName.get(r.family_id) ? ` to ${famName.get(r.family_id)}` : ""}` : `declined${r.decline_reason ? `: ${r.decline_reason}` : ""}`}
                  </span>
                </span>
                {r.decided_at && <span className="shrink-0 text-xs text-muted">{timeAgo(r.decided_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
