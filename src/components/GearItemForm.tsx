import ActionForm, { Field } from "@/components/ActionForm";
import GearLocationPicker from "@/components/GearLocationPicker";
import { saveGearItem } from "@/app/(app)/gear/actions";
import { GEAR_CATEGORIES, type GearItem } from "@/lib/gear";

/** The quartermaster and leaders: add an item to the gear closet, or change one. */
export default function GearItemForm({ item, places = [] }: { item?: GearItem; places?: string[] }) {
  return (
    <ActionForm action={saveGearItem} submit={item ? "Save" : "Add to the closet"} resetOnSuccess={false} className="card space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Name">
        <input className="input" name="name" required maxLength={80} defaultValue={item?.name} placeholder="e.g. Six-person tent" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <select className="input" name="category" defaultValue={item?.category ?? "Tents"}>
            {GEAR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many the pack has">
          <input className="input" type="number" name="quantity" inputMode="numeric" min={0} max={999} required defaultValue={item?.quantity ?? 1} />
        </Field>
      </div>
      <Field label="Where it's kept" hint="The pack shed, or whose house it's at between campouts. Families see this.">
        <GearLocationPicker places={places} value={item?.location ?? null} />
      </Field>
      <Field label="Description (optional)">
        <textarea className="input min-h-20" name="description" maxLength={500} defaultValue={item?.description ?? ""} placeholder="Size, what's in the bag, how to set it up" />
      </Field>
      <Field label="Condition (optional)" hint="Families see this, e.g. “Small tear in the fly, still dry”.">
        <input className="input" name="condition_note" maxLength={200} defaultValue={item?.condition_note ?? ""} />
      </Field>
      {item && (
        <label className="flex min-h-10 items-center gap-3 text-sm font-semibold text-ink">
          <input type="checkbox" name="active" defaultChecked={item.active} className="h-5 w-5 accent-pine" />
          Families can borrow this (untick to put it away)
        </label>
      )}
    </ActionForm>
  );
}
