import "server-only";
import { createClient } from "./supabase/server";
import { getSettings } from "./settings";
import { daysBetween, easternDate } from "./tz";
import type { Adult } from "./types";

// Medical forms (Annual Health and Medical Record, Parts A and B) and dues. The app stores
// only whether a form is on file and its dates, never anything medical.

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

export interface DuesRow {
  family_id: string;
  season: string;
  status: "submitted" | "paid";
  paid_on: string | null;
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

export interface DuesInfo {
  season: string;
  amount: string;
  how: string;
  row: DuesRow | null;
}

/** The signed-in family's people with their forms, and this season's dues. */
export async function getMyPaperwork(me: Adult): Promise<{ people: Person[]; dues: DuesInfo | null }> {
  const supabase = await createClient();
  const settings = await getSettings();
  const [scouts, adults, forms, duesRes] = await Promise.all([
    me.family_id
      ? supabase
          .from("scouts")
          .select("id, first_name, den:dens(name)")
          .eq("family_id", me.family_id)
          .eq("is_active", true)
          .order("first_name")
      : Promise.resolve({ data: [] }),
    me.family_id
      ? supabase
          .from("adults")
          .select("id, first_name, preferred_name")
          .eq("family_id", me.family_id)
          .eq("is_active", true)
          .order("first_name")
      : Promise.resolve({ data: [{ id: me.id, first_name: me.first_name, preferred_name: me.preferred_name }] }),
    supabase.from("health_forms").select("id, scout_id, adult_id, status, form_date, expires_on, updated_at"),
    me.family_id
      ? supabase.from("dues_payments").select("family_id, season, status, paid_on").eq("family_id", me.family_id).eq("season", settings.dues_season).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const list = (forms.data ?? []) as HealthForm[];
  const people: Person[] = [
    ...((scouts.data ?? []) as unknown as { id: string; first_name: string; den: { name: string } | null }[]).map((s) => ({
      kind: "scout" as const,
      id: s.id,
      name: s.first_name,
      detail: s.den?.name ?? "Scout",
      form: list.find((f) => f.scout_id === s.id),
    })),
    ...((adults.data ?? []) as { id: string; first_name: string; preferred_name: string | null }[]).map((a) => ({
      kind: "adult" as const,
      id: a.id,
      name: a.preferred_name || a.first_name,
      detail: "Adult (needed if you camp)",
      form: list.find((f) => f.adult_id === a.id),
    })),
  ];
  const dues = me.family_id
    ? { season: settings.dues_season, amount: settings.dues_amount, how: settings.dues_how, row: (duesRes.data as DuesRow | null) ?? null }
    : null;
  return { people, dues };
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

/** Leaders: everyone's forms and every family's dues for the current season. */
export async function getPaperworkOverview() {
  const supabase = await createClient();
  const settings = await getSettings();
  const [scouts, adults, families, forms, dues] = await Promise.all([
    supabase.from("scouts").select("id, first_name, last_name, family_id, den:dens(id, name, rank, number)").eq("is_active", true),
    supabase.from("adults").select("id, first_name, preferred_name, last_name, family_id").eq("is_active", true).not("family_id", "is", null),
    supabase.from("families").select("id, family_name").eq("is_active", true).order("family_name"),
    supabase.from("health_forms").select("id, scout_id, adult_id, status, form_date, expires_on, updated_at"),
    supabase.from("dues_payments").select("family_id, season, status, paid_on").eq("season", settings.dues_season),
  ]);
  return {
    season: settings.dues_season,
    scouts: (scouts.data ?? []) as unknown as OverviewScout[],
    adults: (adults.data ?? []) as OverviewAdult[],
    families: (families.data ?? []) as { id: string; family_name: string }[],
    forms: (forms.data ?? []) as HealthForm[],
    dues: (dues.data ?? []) as DuesRow[],
  };
}
