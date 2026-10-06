import "server-only";
import { createClient } from "./supabase/server";
import { getLeaderTraining } from "./training-data";
import { COURSES, COURSE_BY_KEY, POSITION_BY_KEY, trainedStatus, trainingState, type CourseKey } from "./training";
import { formState, getPaperworkOverview, type FormState } from "./paperwork";

// Reports for pack leadership (Leaders → Reports), each with a spreadsheet download.
//  * Roster and Membership: read through database functions that check who may open them
//    (supabase/migrations/20261018000000_reports_and_only_scouts.sql): a default by role, plus
//    people a pack admin adds under Pack admin → Report access.
//  * Training and Medical forms: every leader (the same things the Training and Paperwork pages show).

export type ReportKey = "roster" | "membership" | "training" | "forms";

export const REPORTS: Record<ReportKey, { title: string; about: string; href: string; csv: string }> = {
  roster: {
    title: "Roster",
    about: "Everyone registered, and everyone who left in the last two years: contact details, member IDs, roles, registration dates.",
    href: "/leaders/reports/roster",
    csv: "/leaders/reports/roster/csv",
  },
  membership: {
    title: "Membership and dues",
    about: "Who's registered and who has paid registration fees and pack dues. No contact details.",
    href: "/leaders/reports/membership",
    csv: "/leaders/reports/membership/csv",
  },
  training: {
    title: "Training",
    about: "Each leader's training, when it expires, and what their position still needs.",
    href: "/leaders/reports/training",
    csv: "/leaders/reports/training/csv",
  },
  forms: {
    title: "Medical forms",
    about: "Every scout's and adult's Part A and B form: turned in, on file (and who checked it), expiring or missing.",
    href: "/leaders/paperwork",
    csv: "/leaders/paperwork/csv",
  },
};

/** The roster and membership reports this person may open (training and forms: every leader). */
export async function myReports(): Promise<ReportKey[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_reports");
  return ((data ?? []) as string[]).filter((r): r is ReportKey => r === "roster" || r === "membership");
}

export interface RosterRow {
  person: "Scout" | "Adult";
  active: boolean;
  left_on: string | null;
  family: string | null;
  first_name: string;
  last_name: string;
  goes_by: string | null;
  den: string | null;
  role: string | null;
  positions: string | null;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  member_id: string | null;
  registration_expires_on: string | null;
  photo_permission: string | null;
  added_on: string | null;
}

/** null when this person may not open it. */
export async function getRosterReport(): Promise<RosterRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_roster");
  if (error) return null;
  return ((data ?? []) as RosterRow[]).sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.family ?? "~").localeCompare(b.family ?? "~") ||
      a.person.localeCompare(b.person) ||
      a.first_name.localeCompare(b.first_name),
  );
}

export interface MembershipRow {
  person: "Scout" | "Adult";
  name: string;
  den: string | null;
  family: string | null;
  role: string | null;
  registration_expires_on: string | null;
  national_fee: string | null;
  council_fee: string | null;
  pack_dues: string | null;
}

/** null when this person may not open it. */
export async function getMembershipReport(season: string): Promise<MembershipRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_membership", { p_season: season });
  if (error) return null;
  return ((data ?? []) as MembershipRow[]).sort(
    (a, b) => a.person.localeCompare(b.person) * -1 || (a.den ?? "~").localeCompare(b.den ?? "~") || a.name.localeCompare(b.name),
  );
}

/** A charge status in words ("" for none). */
export function chargeLabel(s: string | null): string {
  return s === "paid" ? "Paid" : s === "waived" ? "Waived" : s === "reported" ? "Says paid" : s === "open" ? "Not paid" : "";
}

/** Courses the training report has a column for: required ones, and any course someone has. */
export interface TrainingReportRow {
  name: string;
  positions: string;
  dens: string;
  memberId: string | null;
  courses: Partial<Record<CourseKey, { completed_on: string | null; expires_on: string | null; state: string }>>;
  missing: string[];
  suggested: string[];
}

export async function getTrainingReport(): Promise<{ rows: TrainingReportRow[]; columns: CourseKey[] }> {
  const leaders = await getLeaderTraining();
  const used = new Set<CourseKey>(["ypt", "position", "hazardous_weather", "baloo"]);
  const rows = leaders.map((a) => {
    const status = trainedStatus(a.positions, a.trainings);
    const courses: TrainingReportRow["courses"] = {};
    for (const t of a.trainings) {
      used.add(t.course);
      courses[t.course] = { completed_on: t.completed_on, expires_on: t.expires_on, state: trainingState(t) };
    }
    return {
      name: `${a.preferred_name || a.first_name} ${a.last_name}`,
      positions: a.positions.map((p) => POSITION_BY_KEY[p].label).join(", "),
      dens: a.dens.join(", "),
      memberId: a.bsa_member_id,
      courses,
      missing: status.missing.map((c) => COURSE_BY_KEY[c].short),
      suggested: status.suggested.map((c) => COURSE_BY_KEY[c].short),
    };
  });
  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), columns: COURSES.map((c) => c.key).filter((c) => used.has(c)) };
}

export const FORM_REPORT_LABEL: Record<FormState, string> = {
  missing: "Missing",
  submitted: "Turned in (family said), not checked yet",
  current: "On file",
  expiring: "On file, expiring soon",
  expired: "Expired",
};

export interface FormsReportRow {
  person: "Scout" | "Adult";
  name: string;
  group: string;
  state: FormState;
  form_date: string | null;
  expires_on: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Everyone's medical form, with who last checked it (for the spreadsheet). */
export async function getFormsReport(): Promise<FormsReportRow[]> {
  const data = await getPaperworkOverview();
  const supabase = await createClient();
  const byIds = [...new Set(data.forms.map((f) => f.updated_by).filter(Boolean) as string[])];
  const { data: who } = byIds.length
    ? await supabase.from("adults").select("id, first_name, preferred_name, last_name").in("id", byIds)
    : { data: [] };
  const names = new Map(((who ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string }[]).map((a) => [a.id, `${a.preferred_name || a.first_name} ${a.last_name}`]));
  const famName = new Map(data.families.map((f) => [f.id, f.family_name]));
  const activeFamilies = new Set(data.scouts.map((s) => s.family_id).filter(Boolean) as string[]);
  const row = (person: "Scout" | "Adult", name: string, group: string, f: (typeof data.forms)[number] | undefined): FormsReportRow => ({
    person,
    name,
    group,
    state: formState(f),
    form_date: f?.form_date ?? null,
    expires_on: f?.expires_on ?? null,
    updated_at: f?.updated_at ?? null,
    updated_by: f ? (names.get(f.updated_by ?? "") ?? null) : null,
  });
  return [
    ...data.scouts
      .map((s) => row("Scout", `${s.first_name} ${s.last_name}`, s.den?.name ?? "No den", data.forms.find((f) => f.scout_id === s.id)))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    ...data.adults
      .filter((a) => a.family_id && activeFamilies.has(a.family_id))
      .map((a) => row("Adult", `${a.preferred_name || a.first_name} ${a.last_name}`, `${famName.get(a.family_id!) ?? ""} family`, data.forms.find((f) => f.adult_id === a.id)))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
  ];
}
