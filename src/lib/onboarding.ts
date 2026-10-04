import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { getLeaders, getMyScouts, requireMember } from "./data";
import { getHidden } from "./inbox";
import { formState, getMyPaperwork } from "./paperwork";
import { getMyCharges } from "./payments";
import { regStatus } from "./registration";
import type { ChargeRow } from "./money";

// Getting started: a Home card for families who joined in the last 90 days (see
// public.getting_started_since(): families from the first roster load don't count). Most steps
// tick themselves from the app's data; the calendar, the welcome guide and meeting the den leader
// can't be seen from here, so the family ticks those on their phone. The same rules for the data
// steps are in public.new_family_checklist(), the leaders' list.

/** todo_dismissals key for "Hide" (and "Close" once everything's done). */
export const GETTING_STARTED_KEY = "getting-started";

/** The guide page new families should read. */
export const NEW_FAMILY_GUIDE = "/guide/welcome";

export type StepKey = "registration" | "forms" | "dues" | "alerts" | "calendar" | "guide" | "den-leader";

export interface Step {
  key: StepKey;
  title: string;
  detail: string;
  href: string;
  /** true/false from the app's data; null = the family ticks it on this phone. */
  done: boolean | null;
}

export interface GettingStarted {
  since: string;
  steps: Step[];
}

/** Every scout's Scouting America registration is current (not expired, date on file). */
export function registrationDone(scouts: { registration_expires_on?: string | null }[]): boolean {
  return scouts.every((s) => {
    const st = regStatus(s.registration_expires_on ?? null).state;
    return st === "current" || st === "soon";
  });
}

/** Dues: the pack has added them and none are still open. */
export function duesDone(charges: Pick<ChargeRow, "kind" | "status" | "amount_cents">[]): boolean {
  const dues = charges.filter((c) => c.kind === "dues" && c.status !== "canceled");
  return dues.length > 0 && !dues.some((c) => c.status === "open" && c.amount_cents > 0);
}

/** The signed-in family's Getting started card, or null (not new, hidden, or no family). */
export const getGettingStarted = cache(async (): Promise<GettingStarted | null> => {
  const me = await requireMember();
  if (!me.family_id) return null;
  const supabase = await createClient();
  const [{ data: since }, hidden] = await Promise.all([supabase.rpc("getting_started_since"), getHidden()]);
  if (!since || hidden.has(GETTING_STARTED_KEY)) return null;

  const [scouts, paperwork, charges, alerts, leaders] = await Promise.all([
    getMyScouts(),
    getMyPaperwork(me),
    getMyCharges(me),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("adult_id", me.id)
      .then((r) => r.count ?? 0),
    getLeaders(),
  ]);

  const formsIn = paperwork.people
    .filter((p) => p.kind === "scout")
    .every((p) => {
      const st = formState(p.form);
      return st !== "missing" && st !== "expired";
    });
  const hasDues = charges.some((c) => c.kind === "dues" && c.status !== "canceled");
  const names = scouts.map((s) => s.first_name).join(" and ") || "your scout";

  // Den leaders for this family's dens ("Bear Den Leader" in the leader directory).
  const dens = [...new Set(scouts.map((s) => s.den?.name).filter(Boolean) as string[])];
  const denLeaders = leaders
    .filter((l) => (l.dens ?? "").split(", ").some((part) => dens.some((d) => part.startsWith(`${d} `))))
    .map((l) => l.name);

  const steps: Step[] = [
    {
      key: "registration",
      title: "Scouting America registration",
      detail: registrationDone(scouts)
        ? "Current. Thanks!"
        : `Register or renew ${names} at my.scouting.org. It shows here once the pack's records update.`,
      href: "/family/household",
      done: registrationDone(scouts),
    },
    {
      key: "forms",
      title: "Medical forms",
      detail: formsIn ? "Turned in." : "Parts A and B for each scout. Hand the paper form to a leader and mark it turned in.",
      href: "/family/forms",
      done: formsIn,
    },
    {
      key: "dues",
      title: "Pack dues",
      detail: duesDone(charges) ? "Paid. Thank you!" : hasDues ? "Pay online or by check." : "Your dues show up here once the pack adds them.",
      href: "/pay",
      done: duesDone(charges),
    },
    {
      key: "alerts",
      title: "Phone alerts",
      detail: alerts > 0 ? "On." : "Get a buzz for pack news, changes and reminders.",
      href: "/family/alerts",
      done: alerts > 0,
    },
    {
      key: "calendar",
      title: "Add the pack calendar",
      detail: "On the Calendar page, tap “Add the pack calendar to your phone”.",
      href: "/events",
      done: null,
    },
    {
      key: "guide",
      title: "Read the welcome guide",
      detail: "How the pack works, in a few minutes.",
      href: NEW_FAMILY_GUIDE,
      done: null,
    },
    {
      key: "den-leader",
      title: "Meet your den leader",
      detail: denLeaders.length ? `Say hi to ${denLeaders.join(" and ")} at the next den meeting.` : "Say hi at the next den meeting.",
      href: "/leaders",
      done: null,
    },
  ];
  return { since: since as string, steps };
});

// ---------------------------------------------------------------------------
// Leaders
// ---------------------------------------------------------------------------
export interface NewFamilyRow {
  family_id: string;
  family_name: string;
  joined_at: string;
  adults: string | null;
  scouts: number;
  registered: boolean;
  forms_in: boolean;
  dues_paid: boolean;
  alerts_on: boolean;
  signed_in: boolean;
  /** Steps the app can see aren't done yet. */
  missing: string[];
}

/** New families (last 90 days) and which steps the app can see are still to do. Key leaders only (RLS). */
export async function getNewFamilies(): Promise<NewFamilyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("new_family_checklist");
  return ((data ?? []) as Omit<NewFamilyRow, "missing">[]).map((r) => ({
    ...r,
    missing: [
      !r.registered && "registration",
      !r.forms_in && "medical forms",
      !r.dues_paid && "dues",
      !r.alerts_on && "phone alerts",
    ].filter(Boolean) as string[],
  }));
}

/** Adults with phone alerts on (any phone or browser saved). Key leaders only. */
export async function getAdultsWithAlerts(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("adults_with_alerts");
  return new Set(((data ?? []) as { adult_id: string }[]).map((r) => r.adult_id));
}
