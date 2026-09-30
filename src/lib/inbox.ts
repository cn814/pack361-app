import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { getMyScouts, getUpcomingEvents, isLeader, requireMember } from "./data";
import { isAdmin } from "./advancement-data";
import { formState, getMyPaperwork, needsForm } from "./paperwork";
import { getPolls, getVotedPollIds, isOpen } from "./polls";
import { countPendingPhotos } from "./photos";
import { easternDate } from "./tz";
import { fmtDay } from "./format";
import { rsvpOpen } from "./rsvp";

export interface Todo {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: "gold" | "pine" | "danger";
}

/** When this person last opened Notifications (null = never). */
export const getSeenAt = cache(async (): Promise<string | null> => {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("inbox_reads").select("seen_at").eq("adult_id", me.id).maybeSingle();
  return (data?.seen_at as string | undefined) ?? null;
});

/** Things waiting on this person: polls to answer, forms, dues, photo questions, leader queues. */
export const getTodos = cache(async (): Promise<Todo[]> => {
  const me = await requireMember();
  const supabase = await createClient();
  const leader = isLeader(me);
  const [polls, voted, scouts, paperwork, events, pendingPhotos, waitingForms, openNotes] = await Promise.all([
    getPolls(20),
    getVotedPollIds(me),
    getMyScouts(),
    getMyPaperwork(me),
    getUpcomingEvents(60, { mine: true }),
    leader ? countPendingPhotos() : Promise.resolve(0),
    leader
      ? supabase.from("health_forms").select("id", { count: "exact", head: true }).eq("status", "submitted").then((r) => r.count ?? 0)
      : Promise.resolve(0),
    isAdmin(me)
      ? supabase.from("feedback").select("id", { count: "exact", head: true }).is("resolved_at", null).then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);
  const todos: Todo[] = [];

  // Events asking for an RSVP in the next 30 days that the family hasn't answered.
  const askingRsvp = events.filter(
    (e) => e.kind === "event" && e.rsvp_enabled && rsvpOpen(e) && (Date.parse(e.starts_at) - Date.now()) / 86400000 <= 30,
  );
  if (askingRsvp.length) {
    let q = supabase.from("event_rsvps").select("event_id").in("event_id", askingRsvp.map((e) => e.id));
    q = me.family_id ? q.eq("family_id", me.family_id) : q.eq("adult_id", me.id);
    const answered = new Set(((await q).data ?? []).map((r) => r.event_id as string));
    for (const e of askingRsvp.filter((e) => !answered.has(e.id)).slice(0, 3)) {
      todos.push({
        key: `rsvp-${e.id}`,
        title: `RSVP: ${e.title}`,
        detail: `${fmtDay(e.starts_at)}${e.rsvp_by ? ` · please answer by ${fmtDay(`${e.rsvp_by}T12:00:00-04:00`)}` : ""}`,
        href: `${e.href}#rsvp`,
        tone: "gold",
      });
    }
  }

  for (const p of polls.filter((p) => isOpen(p) && !voted.has(p.id)).slice(0, 3)) {
    todos.push({ key: `poll-${p.id}`, title: "Quick poll", detail: p.question, href: `/polls/${p.id}`, tone: "gold" });
  }

  // Medical forms, when a campout is coming up in the next 60 days.
  const today = easternDate(Date.now());
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
        href: "/family#paperwork",
        tone: "gold",
      });
    }
  }

  if (paperwork.dues?.amount && !paperwork.dues.row) {
    todos.push({ key: "dues", title: `Pack dues for ${paperwork.dues.season}`, detail: paperwork.dues.amount, href: "/family#paperwork", tone: "pine" });
  }

  const noPhotoAnswer = scouts.filter((s) => !s.photo_permission);
  if (noPhotoAnswer.length) {
    todos.push({
      key: "photo-permission",
      title: "One quick question",
      detail: `May ${noPhotoAnswer.map((s) => s.first_name).join(" and ")} appear in the pack's private photo album?`,
      href: "/family#photos",
      tone: "gold",
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
