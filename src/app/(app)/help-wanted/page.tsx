import type { Metadata } from "next";
import { CircleCheck, HandHeart, Plus } from "lucide-react";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { displayName, getLeaders, isCommittee, requireMember } from "@/lib/data";
import { fmtShortDate } from "@/lib/advancement";
import { currentSeason, getAllRoles, getOpenRolesForMe, getVolunteerLoad, type PackRole, type VolunteerLoad } from "@/lib/help-wanted";
import { easternDate } from "@/lib/tz";
import type { Leader } from "@/lib/types";
import { deleteRole, offerHelp, saveRole, setRoleOpen, withdrawOffer } from "./actions";

export const metadata: Metadata = { title: "Help wanted" };

export default async function HelpWantedPage() {
  const me = await requireMember();
  const committee = isCommittee(me);
  const [roles, all, leaders, load] = await Promise.all([
    getOpenRolesForMe(),
    committee ? getAllRoles() : Promise.resolve([] as PackRole[]),
    committee ? getLeaders() : Promise.resolve([] as Leader[]),
    committee ? getVolunteerLoad() : Promise.resolve([] as VolunteerLoad[]),
  ]);

  return (
    <>
      <BackLink href="/pack" label="Pack" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Help wanted</h1>
      <p className="-mt-1 text-sm text-muted">
        Grown-up jobs that keep the pack running this year. Many hands make each one small. Tap &ldquo;I can help&rdquo; and a key leader will reach
        out.
      </p>

      {roles.length === 0 ? (
        <p className="card text-sm text-muted">Every job is filled right now. Thank you!</p>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => (
            <li key={r.id} id={`role-${r.id}`} className="card scroll-mt-20 space-y-2">
              <h2 className="text-base font-extrabold text-pine-950">{r.title}</h2>
              {r.description && <p className="whitespace-pre-line text-sm text-ink">{r.description}</p>}
              {r.contact_name && (
                <p className="text-xs text-muted">
                  Questions? Ask {r.contact_name}
                  {r.contact_title ? `, ${r.contact_title}` : ""}.
                </p>
              )}
              {r.offered ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mint px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-pine">
                    <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> You offered to help. Thank you!
                  </span>
                  <form action={withdrawOffer}>
                    <input type="hidden" name="role_id" value={r.id} />
                    <SubmitButton className="min-h-10 text-xs font-bold text-muted underline">Take back my offer</SubmitButton>
                  </form>
                </div>
              ) : (
                <ActionForm action={offerHelp} submit="I can help" busy="Sending…" className="space-y-2" buttonClass="btn-primary w-full">
                  <input type="hidden" name="role_id" value={r.id} />
                  <details>
                    <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-navy">Add a note (optional)</summary>
                    <textarea className="input mt-1 min-h-20" name="note" maxLength={500} placeholder="e.g. I can do Saturdays, or I'd like to share it with someone" />
                  </details>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}

      {committee && <Leadership roles={all} leaders={leaders} load={load} />}
    </>
  );
}

function Leadership({ roles, leaders, load }: { roles: PackRole[]; leaders: Leader[]; load: VolunteerLoad[] }) {
  const season = currentSeason();
  const helped = load.filter((l) => l.signups > 0);
  const none = load.filter((l) => l.signups === 0);
  return (
    <>
      <h2 className="mt-2 flex items-center gap-1.5 px-1 text-base font-extrabold text-pine-950">
        <HandHeart className="h-4 w-4 text-pine" aria-hidden /> For key leaders
      </h2>

      <details className="card">
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add a job
        </summary>
        <RoleForm leaders={leaders} />
      </details>

      {roles.length > 0 && (
        <ul className="space-y-3">
          {roles.map((r) => (
            <li key={r.id} className={`card space-y-2 ${r.open ? "" : "opacity-80"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-extrabold text-ink">{r.title}</h3>
                <span className={`badge shrink-0 ${r.open ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"}`}>{r.open ? "Open" : "Closed"}</span>
              </div>
              {!r.open && (
                <p className="text-xs text-muted">
                  {r.filled ? `Filled by ${displayName(r.filled)} ${r.filled.last_name}` : "Closed"}
                  {r.closed_at ? ` · ${fmtShortDate(easternDate(r.closed_at))}` : ""}
                </p>
              )}
              <div className="rounded-xl bg-surface-low p-3">
                <p className="text-xs font-bold text-navy">
                  {r.offers.length ? `${r.offers.length} offered to help` : "No offers yet"}
                </p>
                {r.offers.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {r.offers.map((o) => (
                      <li key={o.adult_id} className="text-sm text-ink">
                        <b>{o.adult ? `${displayName(o.adult)} ${o.adult.last_name}` : "Someone"}</b>
                        {o.adult?.family ? <span className="text-muted"> · {o.adult.family.family_name} family</span> : null}
                        <span className="text-xs text-muted"> · {fmtShortDate(easternDate(o.created_at))}</span>
                        {o.note && <span className="block text-xs text-navy">“{o.note}”</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {r.open ? (
                <ActionForm action={setRoleOpen} submit="Close this job" busy="Saving…" resetOnSuccess={false} className="space-y-2" buttonClass="btn-ghost w-full py-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="open" value="0" />
                  {r.offers.length > 0 && (
                    <Field label="Who's doing it (optional)">
                      <select className="input py-2" name="filled_by" defaultValue="">
                        <option value="">Not saying</option>
                        {r.offers.map((o) => (
                          <option key={o.adult_id} value={o.adult_id}>
                            {o.adult ? `${displayName(o.adult)} ${o.adult.last_name}` : "Someone"}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </ActionForm>
              ) : (
                <ActionForm action={setRoleOpen} submit="Open it again" busy="Saving…" resetOnSuccess={false} buttonClass="btn-ghost w-full py-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="open" value="1" />
                </ActionForm>
              )}
              <details>
                <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-navy">Edit or delete</summary>
                <RoleForm leaders={leaders} role={r} />
                <ActionForm
                  action={deleteRole}
                  submit="Delete this job"
                  busy="Deleting…"
                  confirm={`Delete “${r.title}”${r.offers.length ? ` and the ${r.offers.length} offer${r.offers.length === 1 ? "" : "s"}` : ""}? This can't be undone.`}
                  className="mt-3"
                  buttonClass="min-h-10 text-sm font-bold text-danger underline"
                >
                  <input type="hidden" name="id" value={r.id} />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}

      <section className="card space-y-3">
        <div>
          <h3 className="text-[15px] font-extrabold text-ink">Volunteer jobs this season ({season.label})</h3>
          <p className="text-xs text-muted">
            Sign-ups for event volunteer jobs since July 1, per family. Only key leaders see this; use it to ask families who haven&apos;t had a turn.
          </p>
        </div>
        {helped.length === 0 ? (
          <p className="text-sm text-muted">No volunteer sign-ups yet this season.</p>
        ) : (
          <ul className="divide-y divide-line">
            {helped.map((l) => (
              <li key={l.family_id ?? l.family_name} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{l.family_id ? `${l.family_name} family` : l.family_name}</span>
                  {l.people && <span className="block truncate text-xs text-muted">{l.people}</span>}
                </span>
                <span className="shrink-0 text-sm font-extrabold text-pine-950">
                  {l.signups} {l.signups === 1 ? "job" : "jobs"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {none.length > 0 && (
          <div className="rounded-xl bg-gold-50 p-3">
            <p className="text-xs font-bold text-gold-800">Not yet this season ({none.length})</p>
            <p className="text-sm text-ink">{none.map((l) => l.family_name).join(", ")}</p>
          </div>
        )}
      </section>
    </>
  );
}

function RoleForm({ leaders, role }: { leaders: Leader[]; role?: PackRole }) {
  return (
    <ActionForm action={saveRole} submit={role ? "Save" : "Add job"} resetOnSuccess={!role} className="mt-2 space-y-3">
      {role && <input type="hidden" name="id" value={role.id} />}
      <Field label="Job">
        <input className="input" name="title" required maxLength={100} defaultValue={role?.title} placeholder="e.g. Popcorn kernel" />
      </Field>
      <Field label="What it involves (optional)">
        <textarea
          className="input min-h-24"
          name="description"
          maxLength={1000}
          defaultValue={role?.description ?? ""}
          placeholder="How much time, when, and what help there is"
        />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Questions go to (optional)" hint="Families see the name only.">
          <select className="input" name="contact_adult_id" defaultValue={role?.contact_adult_id ?? ""}>
            <option value="">Nobody named</option>
            {leaders.map((l) => (
              <option key={l.adult_id} value={l.adult_id}>
                {l.position_title ? `${l.name}, ${l.position_title}` : l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order">
          <input className="input" type="number" name="sort_order" inputMode="numeric" min={-999} max={999} defaultValue={role?.sort_order ?? 0} />
        </Field>
      </div>
    </ActionForm>
  );
}
