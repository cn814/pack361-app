import { Field } from "@/components/ActionForm";
import type { RosterAdult, RosterDen, RosterScout } from "@/lib/roster-data";
import type { AppRole } from "@/lib/types";

const ROLES: { value: AppRole; label: string; help: string }[] = [
  { value: "parent", label: "Parent", help: "their own family" },
  { value: "den_leader", label: "Den leader", help: "roster, approvals for their den, announcements" },
  { value: "committee", label: "Committee", help: "den-leader access for the whole pack" },
  { value: "cubmaster", label: "Cubmaster", help: "everything, including roster changes" },
  { value: "admin", label: "Pack admin", help: "everything, including roster changes" },
];

/** Inputs for adding or editing an adult. Used inside <ActionForm>. */
export function AdultFields({ adult, familyId }: { adult?: RosterAdult; familyId?: string }) {
  return (
    <>
      {adult && <input type="hidden" name="id" value={adult.id} />}
      {(familyId ?? adult?.family_id) && <input type="hidden" name="family_id" value={familyId ?? adult?.family_id ?? ""} />}
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <input className="input" name="first_name" required defaultValue={adult?.first_name} />
        </Field>
        <Field label="Last name">
          <input className="input" name="last_name" required defaultValue={adult?.last_name} />
        </Field>
      </div>
      <Field label="Email (their sign-in)">
        <input className="input" type="email" name="email" required defaultValue={adult?.email} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Goes by">
          <input className="input" name="preferred_name" defaultValue={adult?.preferred_name ?? ""} />
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" name="phone" defaultValue={adult?.phone ?? ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Relationship">
          <input className="input" name="relationship" placeholder="Mother, Guardian…" defaultValue={adult?.relationship ?? ""} />
        </Field>
        <Field label="BSA member ID" hint="Links my.scouting training imports">
          <input className="input" name="bsa_member_id" inputMode="numeric" maxLength={12} defaultValue={adult?.bsa_member_id ?? ""} />
        </Field>
      </div>
      <Field label="App access">
        <select className="input" name="role" defaultValue={adult?.role ?? (familyId ? "parent" : "den_leader")}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}: {r.help}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pack position (shown in the leader directory)">
        <input className="input" name="position_title" placeholder="e.g. Treasurer, Bear Den Leader" defaultValue={adult?.position_title ?? ""} />
      </Field>
      {adult && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="is_active" defaultChecked={adult.is_active} className="h-4 w-4 accent-pine" />
          Can sign in (uncheck when they leave the pack)
        </label>
      )}
    </>
  );
}

/** Inputs for adding or editing a scout. */
export function ScoutFields({ scout, familyId, dens }: { scout?: RosterScout; familyId: string; dens: RosterDen[] }) {
  return (
    <>
      {scout && <input type="hidden" name="id" value={scout.id} />}
      <input type="hidden" name="family_id" value={familyId} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <input className="input" name="first_name" required defaultValue={scout?.first_name} />
        </Field>
        <Field label="Last name">
          <input className="input" name="last_name" required defaultValue={scout?.last_name} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Den">
          <select className="input" name="den_id" defaultValue={scout?.den_id ?? ""}>
            <option value="">No den</option>
            {dens
              .filter((d) => d.is_active || d.id === scout?.den_id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="BSA member ID" hint="Links Scoutbook imports">
          <input className="input" name="bsa_member_id" inputMode="numeric" defaultValue={scout?.bsa_member_id ?? ""} />
        </Field>
      </div>
      <Field label="Photos in the pack album">
        <select className="input" name="photo_permission" defaultValue={scout?.photo_permission ?? ""}>
          <option value="">Family hasn&apos;t answered (treated as no)</option>
          <option value="yes">Yes, OK in pack photos</option>
          <option value="no">No photos</option>
        </select>
      </Field>
      {scout && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="is_active" defaultChecked={scout.is_active} className="h-4 w-4 accent-pine" />
          Active in the pack
        </label>
      )}
    </>
  );
}
