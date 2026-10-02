import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { getMyScouts, getUpcomingEvents, isCommittee, isLeader, requireMember } from "./data";
import { isAdmin } from "./advancement-data";
import { namesList, slipsToSign } from "./slips";
import { formState, getMyPaperwork, needsForm } from "./paperwork";
import { getMyCharges, totalDue } from "./payments";
import { fmtMoney } from "./money";
import { getPolls, getVotedPollIds, isOpen } from "./polls";
import { countPendingPhotos } from "./photos";
import { daysBetween, easternDate } from "./tz";
import { fmtDay } from "./format";
import { rsvpOpen } from "./rsvp";
import { fmtRegDate, needsRenewal, regStatus } from "./registration";
import { getSettings } from "./settings";
import { TRAINING_IMPORT_DAYS, trainingImportDue, trainingKeeperIds } from "./training";

export interface Todo {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: "gold" | "pine" | "danger";
  /** RSVP right from the to-do: Going, Maybe, Can't make it. `paid` events open the event for Going (counts set the cost). */
  rsvp?: { eventId: string; paid: boolean; today: boolean };
  /** Can be hidden with "Not now" until this time (null = for good). */
  hide?: { key: string; until: string | null };
}

/** Items someone hid with "Not now" that are still hidden. */
export const getHidden = cache(async (): Promise<Set<string>> => {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("todo_dismissals").select("key, hidden_until").eq("adult_id", me.id);
  const now = Date.now();
  return new Set(
    ((data ?? []) as { key: string; hidden_until: string | null }[])
      .filter((d) => !d.hidden_until || Date.parse(d.hidden_until) > now)
      .map((d) => d.key),
  );
});

/** When this person last opened Notifications (null = never). */
export const getSeenAt = cache(async (): Promise<string | null> => {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("inbox_reads").select("seen_at").eq("adult_id", me.id).maybeSingle();
  return (data?.seen_at as string | undefined) ?? null;
});

/** Regular meetings: no RSVP to-do for these. */
const ROUTINE_CATEGORIES = new Set(["Den Meeting", "Pack Meeting", "Committee"]);

/** Things waiting on this person: polls to answer, forms, money due, photo questions, leader queues. */
export const getTodos = cache(async (): Promise<Todo[]> => {
  const me = await requireMember();
  const supabase = await createClient();
  const leader = isLeader(me);
  // Today's events too, so a "maybe" can come back on the day.
  const rsvpQ = supabase.from("event_rsvps").select("event_id, status, scouts, event:events!inner(starts_at)").gte("event.starts_at", new Date(Date.now() - 86400000).toISOString());
  const [polls, voted, scouts, paperwork, charges, events, pendingPhotos, waitingForms, openNotes, reportedPayments, myRsvps, hidden, waitingJoins, trainingImport] = await Promise.all([
    getPolls(20),
    getVotedPollIds(me),
    getMyScouts(),
    getMyPaperwork(me),
    getMyCharges(me),
    getUpcomingEvents(60, { mine: true }),
    leader ? countPendingPhotos() : Promise.resolve(0),
    leader
      ? supabase.from("health_forms").select("id", { count: "exact", head: true }).eq("status", "submitted").then((r) => r.count ?? 0)
      : Promise.resolve(0),
    isAdmin(me)
      ? supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null).then((r) => r.count ?? 0)
      : Promise.resolve(0),
    isCommittee(me)
      ? supabase.from("charges").select("id", { count: "exact", head: true }).eq("status", "reported").then((r) => r.count ?? 0)
      : Promise.resolve(0),
    // What this family (or an adult without one) has already answered, for upcoming events.
    (me.family_id ? rsvpQ.eq("family_id", me.family_id) : rsvpQ.eq("adult_id", me.id)).then((r) => r.data ?? []),
    getHidden(),
    isAdmin(me)
      ? supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending").then((r) => r.count ?? 0)
      : Promise.resolve(0),
    // The monthly my.scouting training import, for the Committee Chair (or the admins).
    isCommittee(me) ? trainingImportTodo(me.id) : Promise.resolve(null),
  ]);
  const todos: Todo[] = [];

  // RSVPs for special events (regular meetings are left out: families can still RSVP on them,
  // but they'd flood the list). Answer right from the to-do. Only what's close: the next two
  // weeks, a campout or paid event in the next 30 days, or an RSVP-by date in the next two weeks;
  // two at a time. "Maybe" hides it until the day of the event, then it asks again.
  const today = easternDate(Date.now());
  const said = new Map(myRsvps.map((r) => [r.event_id as string, r.status as string]));
  const paid = (e: (typeof events)[number]) => e.fee_family_cents != null || e.fee_scout_cents != null || e.fee_adult_cents != null;
  const daysAway = (e: (typeof events)[number]) => (Date.parse(e.starts_at) - Date.now()) / 86400000;
  const open = events.filter((e) => e.kind === "event" && !ROUTINE_CATEGORIES.has(e.category) && e.rsvp_enabled && rsvpOpen(e));
  for (const e of open.filter((e) => said.get(e.id) === "maybe" && easternDate(e.starts_at) === today)) {
    todos.push({
      key: `rsvp-${e.id}`,
      title: `Today: ${e.title}`,
      detail: "You said maybe. Are you going?",
      href: `${e.href}#rsvp`,
      tone: "gold",
      rsvp: { eventId: e.id, paid: paid(e), today: true },
    });
  }
  const ask = open.filter(
    (e) =>
      !said.has(e.id) &&
      (daysAway(e) <= 14 ||
        ((e.category === "Campout" || paid(e)) && daysAway(e) <= 30) ||
        (e.rsvp_by ? daysBetween(today, e.rsvp_by) <= 14 : false)),
  );
  for (const e of ask.slice(0, 2)) {
    todos.push({
      key: `rsvp-${e.id}`,
      title: `RSVP: ${e.title}`,
      detail: `${fmtDay(e.starts_at)}${e.rsvp_by ? ` · please answer by ${fmtDay(`${e.rsvp_by}T12:00:00-04:00`)}` : ""}`,
      href: `${e.href}#rsvp`,
      tone: "gold",
      rsvp: { eventId: e.id, paid: paid(e), today: false },
    });
  }

  // Permission slips for events the family said Going to.
  const slipEvents = events.filter((e) => e.kind === "event" && e.slip_required && said.get(e.id) === "yes");
  if (slipEvents.length && scouts.length) {
    const { data: slipRows } = await supabase
      .from("permission_slips")
      .select("event_id, scout_id")
      .in("event_id", slipEvents.map((e) => e.id))
      .in("scout_id", scouts.map((s) => s.id));
    const signed = new Set((slipRows ?? []).map((r) => `${r.event_id}|${r.scout_id}`));
    const goingScouts = new Map(myRsvps.filter((r) => r.status === "yes").map((r) => [r.event_id as string, Number(r.scouts ?? 0)]));
    for (const { event: e, names } of slipsToSign(slipEvents, goingScouts, scouts, signed)) {
      todos.push({
        key: `slip-${e.id}`,
        title: `Permission slip: ${e.title}`,
        detail: `Sign for ${namesList(names)}${e.slip_due ? ` by ${fmtDay(`${e.slip_due}T12:00:00-04:00`)}` : ""}.`,
        href: `${e.href}#slip`,
        tone: "gold",
      });
    }
  }

  for (const p of polls.filter((p) => isOpen(p) && !voted.has(p.id) && !hidden.has(`poll-${p.id}`)).slice(0, 3)) {
    // "Not now" hides it until a day before it closes (for good if it has no closing date).
    const closes = p.closes_at ? Date.parse(p.closes_at) - 86400000 : null;
    todos.push({
      key: `poll-${p.id}`,
      title: "Quick poll",
      detail: p.question,
      href: `/polls/${p.id}`,
      tone: "gold",
      hide: { key: `poll-${p.id}`, until: closes === null ? null : closes > Date.now() ? new Date(closes).toISOString() : p.closes_at },
    });
  }

  // Medical forms, when a campout is coming up in the next 60 days.
  const campout = events.find(
    (e) => e.kind === "event" && e.category === "Campout" && (Date.parse(e.starts_at) - Date.now()) / 86400000 <= 60,
  );
  if (campout) {
    const day = easternDate(campout.starts_at);
    const missing = paperwork.people.filter((p) => p.kind === "scout" && needsForm(formState(p.form, day > today ? day : undefined)));
    if (missing.length) {
      todos.push({
        key: "forms",
        title: `Medical forms for ${campout.title}`,
        detail: `${missing.map((p) => p.name).join(" and ")} ${missing.length === 1 ? "needs" : "need"} a current form (Parts A and B) by ${fmtDay(campout.starts_at)}. Adults who camp need one too.`,
        href: "/family/forms",
        tone: "gold",
      });
    }
  }

  const owed = totalDue(charges);
  if (owed > 0) {
    const items = charges.filter((c) => c.status === "open" && c.amount_cents > 0);
    todos.push({
      key: "dues",
      title: `You have ${fmtMoney(owed)} due`,
      detail: items.length === 1 ? items[0].title : `${items.length} items: ${items.slice(0, 2).map((c) => c.title).join(", ")}${items.length > 2 ? "…" : ""}`,
      href: "/pay",
      tone: "pine",
    });
  }

  // Scouting America registration about to run out (or already out): renew at my.scouting.org.
  const renew = [
    ...scouts.map((s) => ({ name: s.first_name, on: s.registration_expires_on ?? null })),
    ...(me.registration_expires_on ? [{ name: "you", on: me.registration_expires_on }] : []),
  ].filter((r) => needsRenewal(regStatus(r.on)));
  if (renew.length) {
    const soonest = renew.map((r) => r.on!).sort()[0];
    const past = regStatus(soonest).state === "expired";
    todos.push({
      key: "registration",
      title: "Renew Scouting America registration",
      detail: `For ${renew.map((r) => r.name).join(" and ")}: ${past ? "expired" : "expires"} ${fmtRegDate(soonest)}. Renew and pay at my.scouting.org (link under Me → Family and registration).`,
      href: "/family/household",
      tone: past ? "danger" : "gold",
    });
  }

  const noPhotoAnswer = scouts.filter((s) => !s.photo_permission);
  if (noPhotoAnswer.length) {
    todos.push({
      key: "photo-permission",
      title: "One quick question",
      detail: `May ${noPhotoAnswer.map((s) => s.first_name).join(" and ")} appear in the pack's private photo album?`,
      href: "/family/household#photos",
      tone: "gold",
    });
  }

  if (waitingJoins) {
    todos.push({
      key: "join-requests",
      title: `${waitingJoins} ${waitingJoins === 1 ? "person" : "people"} asked to join`,
      detail: "Signed in with an email that isn't on the roster.",
      href: "/admin/join",
      tone: "danger",
    });
  }
  if (pendingPhotos) {
    todos.push({
      key: "photos",
      title: `${pendingPhotos} photo${pendingPhotos === 1 ? "" : "s"} to review`,
      detail: "New uploads and removal requests.",
      href: "/photos/review",
      tone: "danger",
    });
  }
  if (waitingForms) {
    todos.push({
      key: "forms-waiting",
      title: `${waitingForms} medical form${waitingForms === 1 ? "" : "s"} turned in`,
      detail: "Confirm you have the paper copies.",
      href: "/leaders/paperwork",
      tone: "pine",
    });
  }
  if (reportedPayments) {
    todos.push({
      key: "payments-reported",
      title: `${reportedPayments} payment${reportedPayments === 1 ? "" : "s"} to confirm`,
      detail: "Families say they paid by check or cash.",
      href: "/leaders/money?status=reported",
      tone: "pine",
    });
  }
  if (trainingImport && !hidden.has("training-import")) todos.push(trainingImport);
  if (openNotes) {
    todos.push({
      key: "notes",
      title: `${openNotes} message${openNotes === 1 ? "" : "s"} from families`,
      detail: "Problems and notes sent from the app.",
      href: "/admin/messages",
      tone: "pine",
    });
  }
  return todos;
});

/** "Update everyone's training", when this person keeps it and the last import is over a month old. */
async function trainingImportTodo(myId: string): Promise<Todo | null> {
  const last = (await getSettings()).training_last_import;
  if (!trainingImportDue(last)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("adults")
    .select("id, role, position_title")
    .eq("is_active", true)
    .in("role", ["committee", "cubmaster", "admin"]);
  if (!trainingKeeperIds(data ?? []).includes(myId)) return null;
  return {
    key: "training-import",
    title: "Update everyone's training",
    detail: last
      ? `Last imported from my.scouting ${Math.floor((Date.now() - Date.parse(last)) / 86400000)} days ago. Run the training report there and upload it (about 5 minutes).`
      : `Run the training report on my.scouting and upload it, then again every ${TRAINING_IMPORT_DAYS} days or so (about 5 minutes).`,
    href: "/leaders/training/import",
    tone: "gold",
    hide: { key: "training-import", until: new Date(Date.now() + 7 * 86400000).toISOString() },
  };
}

/** The bell's number: new announcements, den messages and polls since Notifications was opened, plus to-dos. */
export const getInboxCount = cache(async (): Promise<number> => {
  const me = await requireMember();
  const supabase = await createClient();
  const seen = (await getSeenAt()) ?? new Date(Date.now() - 14 * 86400000).toISOString();
  const [posts, polls, todos] = await Promise.all([
    supabase.from("announcements").select("id", { count: "exact", head: true }).gt("created_at", seen).neq("author_id", me.id),
    supabase.from("polls").select("id", { count: "exact", head: true }).gt("created_at", seen).neq("created_by", me.id),
    getTodos(),
  ]);
  // A new poll is also a to-do; don't count it twice.
  const pollTodos = todos.filter((t) => t.key.startsWith("poll-")).length;
  return (posts.count ?? 0) + Math.max(0, (polls.count ?? 0) - pollTodos) + todos.length;
});
