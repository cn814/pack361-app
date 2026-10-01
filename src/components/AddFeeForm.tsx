"use client";

import { useState } from "react";
import ActionForm, { Field } from "@/components/ActionForm";
import { addFee } from "@/app/(app)/leaders/money/actions";
import { centsToInput, KIND_LABEL, type ChargeKind } from "@/lib/money";

export interface FeeDefaults {
  dues_season: string;
  registration_year: string;
  dues: number;
  national_youth: number;
  national_adult: number;
  council_youth: number;
  council_adult: number;
}

type Who = "families" | "scouts" | "leaders" | "den_families" | "den_scouts" | "family" | "person";

const WHO_LABEL: Record<Who, string> = {
  families: "Every active family",
  scouts: "Every active scout",
  leaders: "Every active adult leader",
  den_families: "Families in one den",
  den_scouts: "Scouts in one den",
  family: "One family",
  person: "One person",
};
const PER_PERSON: Who[] = ["scouts", "leaders", "den_scouts", "person"];

function defaultTitle(kind: ChargeKind, d: FeeDefaults): string {
  if (kind === "dues") return `Pack dues ${d.dues_season}`;
  if (kind === "national") return `Scouting America registration ${d.registration_year}`.trim();
  if (kind === "council") return `Council fee ${d.registration_year}`.trim();
  return "";
}

function defaultAmount(kind: ChargeKind, who: Who, person: string, d: FeeDefaults): number | null {
  const adult = who === "leaders" || (who === "person" && person.startsWith("a:"));
  if (kind === "dues") return d.dues;
  if (kind === "national") return adult ? d.national_adult : d.national_youth;
  if (kind === "council") return adult ? d.council_adult : d.council_youth;
  return null;
}

/** Leaders: add a fee for a group of people. Amounts start from the pack's settings. */
export default function AddFeeForm({
  defaults,
  dens,
  families,
  people,
  events,
  registrationBilling,
}: {
  defaults: FeeDefaults;
  /** The pack bills Scouting America and council registration (off by default: families pay it at my.scouting.org). */
  registrationBilling: boolean;
  dens: { id: string; name: string }[];
  families: { id: string; name: string }[];
  people: { value: string; label: string }[];
  events: { id: string; label: string }[];
}) {
  const [kind, setKind] = useState<ChargeKind>("dues");
  const [who, setWho] = useState<Who>("families");
  const [person, setPerson] = useState("");
  const [title, setTitle] = useState(defaultTitle("dues", defaults));
  const [season, setSeason] = useState(defaults.dues_season);
  const [amount, setAmount] = useState(centsToInput(defaults.dues || null));

  const refill = (k: ChargeKind, w: Who, p: string) => {
    const a = defaultAmount(k, w, p, defaults);
    if (a !== null) setAmount(a ? centsToInput(a) : "");
  };
  const changeKind = (k: ChargeKind) => {
    setKind(k);
    setTitle(defaultTitle(k, defaults));
    setSeason(k === "dues" ? defaults.dues_season : k === "national" || k === "council" ? defaults.registration_year : "");
    let w = who;
    if ((k === "national" || k === "council") && !PER_PERSON.includes(who)) {
      w = "scouts";
      setWho(w);
    }
    refill(k, w, person);
  };
  const changeWho = (w: Who) => {
    setWho(w);
    refill(kind, w, person);
  };
  const changePerson = (p: string) => {
    setPerson(p);
    refill(kind, who, p);
  };
  const registration = kind === "national" || kind === "council";
  const whoChoices = (Object.keys(WHO_LABEL) as Who[]).filter((w) => !registration || PER_PERSON.includes(w));

  return (
    <ActionForm action={addFee} submit="Add fee" busy="Adding…">
      <Field label="What it's for">
        <select className="input" name="kind" value={kind} onChange={(e) => changeKind(e.target.value as ChargeKind)}>
          {(Object.keys(KIND_LABEL) as ChargeKind[]).filter((k) => registrationBilling || (k !== "national" && k !== "council")).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {kind === "event" && (
        <Field label="Event" hint="Families who RSVP yes to an event with a cost get its fee automatically. Use this for anyone else.">
          <select className="input" name="event_id" required defaultValue="">
            <option value="" disabled>
              Pick the event
            </option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Name families see">
        <input
          className="input"
          name="title"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "event" ? "Spring campout" : "Pack T-shirt"}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount ($)">
          <input className="input" name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Due (optional)">
          <input className="input" type="date" name="due_on" />
        </Field>
      </div>
      {(kind === "dues" || registration) && (
        <Field label={kind === "dues" ? "Season" : "Registration year"} hint="Each person or family gets this fee only once per season.">
          <input className="input" name="season" required value={season} onChange={(e) => setSeason(e.target.value)} placeholder={kind === "dues" ? "2026-27" : "2027"} />
        </Field>
      )}
      <Field
        label="Who owes it"
        hint={
          (who === "leaders" ? "Anyone with a leader role or position, and den leaders. " : "") +
          (who === "families" || who === "den_families" || who === "family"
            ? "One per family: a family that already has this fee is skipped."
            : "One per person: each scout or adult gets their own, so siblings each owe it. Anyone who already has it is skipped.")
        }
      >
        <select className="input" name="who" value={who} onChange={(e) => changeWho(e.target.value as Who)}>
          {whoChoices.map((w) => (
            <option key={w} value={w}>
              {WHO_LABEL[w]}
            </option>
          ))}
        </select>
      </Field>
      {(who === "den_families" || who === "den_scouts") && (
        <Field label="Den">
          <select className="input" name="den_id" required defaultValue="">
            <option value="" disabled>
              Pick a den
            </option>
            {dens.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {who === "family" && (
        <Field label="Family">
          <select className="input" name="family_id" required defaultValue="">
            <option value="" disabled>
              Pick a family
            </option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {who === "person" && (
        <Field label="Person" hint="The fee goes to their family to pay.">
          <select className="input" name="person" required value={person} onChange={(e) => changePerson(e.target.value)}>
            <option value="" disabled>
              Pick a scout or adult
            </option>
            {people.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}
    </ActionForm>
  );
}
