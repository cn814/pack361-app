import "server-only";
import { createClient } from "./supabase/server";
import { getMyScouts } from "./data";
import { daysBetween, easternDate } from "./tz";
import type { Adult } from "./types";

// Medical forms (Annual Health and Medical Record, Parts A and B). The app stores only whether
// a form is on file and its dates, never anything medical. (Dues are charges now: src/lib/payments.ts.)

export const AHMR_URL = "https://filestore.scouting.org/filestore/HealthSafety/pdf/680-001_AB.pdf";

export interface HealthForm {
  id: string;
  scout_id: string | null;
  adult_id: string | null;
  status: "submitted" | "on_file";
  form_date: string | null;
  expires_on: string | null;
  updated_at: string;
}

export type FormState = "missing" | "submitted" | "current" | "expiring" | "expired";

/** Where a form stands today (or on `onDate`, e.g. a campout's first day). */
export function formState(f: HealthForm | undefined, onDate?: string): FormState {
  if (!f) return "missing";
  const today = easternDate(Date.now());
  const check = onDate && onDate > today ? onDate : today;
  if (f.expires_on && f.expires_on < check) return "expired";
  if (f.status === "submitted") return "submitted";
  if (f.expires_on && daysBetween(today, f.expires_on) <= 45) return "expiring";
  return "current";
}

export const FORM_STATE_LABEL: Record<FormState, string> = {
  missing: "Not turned in",
  submitted: "Turned in, waiting for a leader",
  current: "On file",
  expiring: "Expires soon",
  expired: "Expired",
};

export const FORM_STATE_STYLE: Record<FormState, string> = {
  missing: "bg-surface text-muted",
  submitted: "bg-gold-50 text-gold-800",
  current: "bg-mint text-pine",
  expiring: "bg-gold-50 text-gold-800",
  expired: "bg-danger-50 text-danger",
};

export const needsForm = (s: FormState) => s === "missing" || s === "expired" || s === "expiring";

export interface Person {
  kind: "scout" | "adult";
  id: string;
  name: string;
  detail: string | null;
  form?: HealthForm;
}

const FORM_COLS = "id, scout_id, adult_id, status, form_date, expires_on, updated_at";

/**
 * The signed-in family's people with their forms. `me` is the signed-in adult (the scouts come
 * from getMyScouts, read once per request). Only this family's forms are read, even for leaders,
 * who may see the whole pack's.
 */
export async function getMyPaperwork(me: Adult): Promise<{ people: Person[] }> {
  const supabase = await createClient();
  const scoutsP: Promise<{ id: string; first_name: string; den: { name: string } | null }[]> = me.family_id
    ? getMyScouts()
    : Promise.resolve([]);
  const adultsP: Promise<{ id: string; first_name: string; preferred_name: string | null }[]> = me.family_id
    ? Promise.resolve(
        supabase
          .from("adults")
          .select("id, first_name, preferred_name")
          .eq("family_id", me.family_id)
          .eq("is_active", true)
          .order("first_name"),
      ).then((r) => (r.data ?? []) as { id: string; first_name: string; preferred_name: string | null }[])
    : Promise.resolve([{ id: me.id, first_name: me.first_name, preferred_name: me.preferred_name }]);
  const formsFor = (col: "scout_id" | "adult_id", ids: string[]): PromiseLike<HealthForm[]> =>
    ids.length
      ? supabase
          .from("health_forms")
          .select(FORM_COLS)
          .in(col, ids)
          .then((r) => (r.data ?? []) as HealthForm[])
      : Promise.resolve([]);
  const [scouts, adults, scoutForms, adultForms] = await Promise.all([
    scoutsP,
    adultsP,
    scoutsP.then((list) => formsFor("scout_id", list.map((s) => s.id))),
    adultsP.then((list) => formsFor("adult_id", list.map((a) => a.id))),
  ]);
  const byScout = new Map(scoutForms.map((f) => [f.scout_id, f]));
  const byAdult = new Map(adultForms.map((f) => [f.adult_id, f]));
  const people: Person[] = [
    ...scouts.map((s) => ({
      kind: "scout" as const,
      id: s.id,
      name: s.first_name,
      detail: s.den?.name ?? "Scout",
      form: byScout.get(s.id),
    })),
    ...adults.map((a) => ({
      kind: "adult" as const,
      id: a.id,
      name: a.preferred_name || a.first_name,
      detail: "Adult (needed if you camp)",
      form: byAdult.get(a.id),
    })),
  ];
  return { people };
}

export interface OverviewScout {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string | null;
  den: { id: string; name: string; rank: string; number: number } | null;
}
export interface OverviewAdult {
  id: string;
  first_name: string;
  preferred_name: string | null;
  last_name: string;
  family_id: string | null;
}

/** Leaders: everyone's forms. */
export async function getPaperworkOverview() {
  const supabase = await createClient();
  const [scouts, adults, families, forms] = await Promise.all([
    supabase.from("scouts").select("id, first_name, last_name, family_id, den:dens(id, name, rank, number)").eq("is_active", true),
    supabase.from("adults").select("id, first_name, preferred_name, last_name, family_id").eq("is_active", true).not("family_id", "is", null),
    supabase.from("families").select("id, family_name").eq("is_active", true).order("family_name"),
    supabase.from("health_forms").select(FORM_COLS),
  ]);
  return {
    scouts: (scouts.data ?? []) as unknown as OverviewScout[],
    adults: (adults.data ?? []) as OverviewAdult[],
    families: (families.data ?? []) as { id: string; family_name: string }[],
    forms: (forms.data ?? []) as HealthForm[],
  };
}
