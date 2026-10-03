import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCalendar, type CalItem, type DenScope } from "./calendar";
import { APP_URL } from "./email";
import { sendPersonal } from "./bulk-email";
import { eventOver, fmtDay, fmtRange } from "./format";
import { fmtMoney } from "./money";
import { formState, needsForm, type HealthForm } from "./paperwork";
import { namesList, slipsToSign } from "./slips";
import { fmtRegDate, needsRenewal, regStatus } from "./registration";
import { rsvpOpen } from "./rsvp";
import { easternDate, startOfEasternDay } from "./tz";
import type { DenRank } from "./types";

// The weekly family newsletter: one email per adult every Sunday morning (sent by the morning
// cron), the same for everyone in a family. It replaces TroopWebHost's Sunday newsletter.
// Built with the secret-key client, so every query below is limited to the family by hand.

export type NewsletterMode = "off" | "test" | "everyone";
export const NEWSLETTER_MODES: Record<NewsletterMode, string> = {
  off: "Off",
  test: "Testing: only the people ticked below",
  everyone: "Every family",
};

/** The saved setting as a mode ("admins" was the first name for testing). */
export function newsletterMode(v: string | null | undefined): NewsletterMode {
  return v === "off" || v === "everyone" ? v : "test";
}

/** Adult ids from the newsletter_test_adults setting. */
export function testAdultIds(v: string | null | undefined): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
}

/** Regular meetings: shown on the list, but not nagged about in "Needs your answer". */
const ROUTINE = new Set(["Den Meeting", "Pack Meeting", "Committee"]);
const DAY = 86400000;

export interface Recipient {
  id: string;
  email: string;
  first_name: string;
  preferred_name: string | null;
  last_name: string;
  family_id: string | null;
  registration_expires_on: string | null;
}

const RECIPIENT_COLS = "id, email, first_name, preferred_name, last_name, family_id, registration_expires_on";

/** The Sunday (Eastern) that starts the week `now` is in. */
export function weekOf(now = Date.now()): string {
  const today = easternDate(now);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const isSundayEastern = (now = Date.now()) => weekOf(now) === easternDate(now);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (path: string) => `${APP_URL}${path}`;
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// What a family's newsletter says
// ---------------------------------------------------------------------------
export interface Line {
  when: string;
  title: string;
  href: string;
  where: string | null;
  tag: string | null;
  rsvp: string | null; // "Going", "Not going", "Maybe", or null
  askRsvp: boolean;
}

export interface FamilyNews {
  familyName: string | null;
  thisWeek: Line[];
  nextWeek: Line[];
  needs: { text: string; href: string; button: string }[];
  announcements: { title: string; body: string; den: boolean }[];
  volunteers: { text: string; href: string }[];
  highlight: string | null;
}

async function familyNews(db: SupabaseClient, r: Recipient): Promise<FamilyNews> {
  const now = Date.now();
  const today = easternDate(now);
  const in14 = Date.parse(startOfEasternDay(easternDate(now + 14 * DAY)));
  const in7 = Date.parse(startOfEasternDay(easternDate(now + 7 * DAY)));

  // The family's scouts and adults (or just this adult, without a family).
  const [{ data: fam }, { data: scoutRows }, { data: adultRows }] = await Promise.all([
    r.family_id ? db.from("families").select("family_name").eq("id", r.family_id).maybeSingle() : Promise.resolve({ data: null }),
    r.family_id
      ? db.from("scouts").select("id, first_name, den_id, registration_expires_on, den:dens(rank)").eq("family_id", r.family_id).eq("is_active", true)
      : Promise.resolve({ data: [] }),
    r.family_id
      ? db.from("adults").select("id, first_name, preferred_name, registration_expires_on").eq("family_id", r.family_id).eq("is_active", true)
      : Promise.resolve({ data: [{ id: r.id, first_name: r.first_name, preferred_name: r.preferred_name, registration_expires_on: r.registration_expires_on }] }),
  ]);
  const scouts = (scoutRows ?? []) as unknown as { id: string; first_name: string; den_id: string | null; registration_expires_on: string | null; den: { rank: DenRank } | null }[];
  const adults = (adultRows ?? []) as { id: string; first_name: string; preferred_name: string | null; registration_expires_on: string | null }[];
  const dens = [...new Set(scouts.map((s) => s.den_id).filter((d): d is string => Boolean(d)))];
  const scope: DenScope = { dens, ranks: [...new Set(scouts.map((s) => s.den?.rank).filter((x): x is DenRank => Boolean(x)))] };

  // Six weeks of calendar: two for the list, the rest to spot a campout that needs forms.
  // From the start of today (Eastern), so today's all-day events and a campout that ends today
  // (all-day ends_at is the last day's midnight) are still listed at 6 AM; eventOver then keeps
  // all-day items through their last day and timed ones until they end.
  const items = (await loadCalendar(db, scope, { since: startOfEasternDay(today), limit: 150 })).filter((i) => !eventOver(i));
  const soon = items.filter((i) => Date.parse(i.starts_at) < in14);
  const eventIds = soon.filter((i) => i.kind === "event").map((i) => i.id);
  const meetingIds = soon.filter((i) => i.kind === "meeting").map((i) => i.id);

  const since7 = new Date(now - 7 * DAY).toISOString();
  const adultIds = adults.map((a) => a.id);
  const [rsvps, meetingRsvps, charges, forms, posts, polls, votes, slots] = await Promise.all([
    eventIds.length
      ? (r.family_id
          ? db.from("event_rsvps").select("event_id, status, scouts").in("event_id", eventIds).eq("family_id", r.family_id)
          : db.from("event_rsvps").select("event_id, status, scouts").in("event_id", eventIds).is("family_id", null).eq("adult_id", r.id)
        ).then((x) => (x.data ?? []) as { event_id: string; status: string; scouts: number }[])
      : Promise.resolve([]),
    meetingIds.length && scouts.length
      ? db
          .from("den_meeting_rsvps")
          .select("meeting_id, going")
          .in("meeting_id", meetingIds)
          .in("scout_id", scouts.map((s) => s.id))
          .then((x) => (x.data ?? []) as { meeting_id: string; going: boolean }[])
      : Promise.resolve([]),
    (r.family_id ? db.from("charges").select("title, amount_cents").eq("family_id", r.family_id) : db.from("charges").select("title, amount_cents").is("family_id", null).eq("adult_id", r.id))
      .eq("status", "open")
      .gt("amount_cents", 0)
      .then((x) => (x.data ?? []) as { title: string; amount_cents: number }[]),
    db
      .from("health_forms")
      .select("id, scout_id, adult_id, status, form_date, expires_on, updated_at")
      .or(
        [scouts.length ? `scout_id.in.(${scouts.map((s) => s.id).join(",")})` : null, `adult_id.in.(${adultIds.join(",")})`].filter(Boolean).join(","),
      )
      .then((x) => (x.data ?? []) as HealthForm[]),
    db
      .from("announcements")
      .select("title, body, den_id, created_at")
      .gte("created_at", since7)
      .or(dens.length ? `den_id.is.null,den_id.in.(${dens.join(",")})` : "den_id.is.null")
      .order("created_at", { ascending: false })
      .limit(8)
      .then((x) => (x.data ?? []) as { title: string; body: string; den_id: string | null }[]),
    db
      .from("polls")
      .select("id, question, den_id, closes_at, closed_at, created_at")
      .is("closed_at", null)
      .gte("created_at", new Date(now - 30 * DAY).toISOString())
      .or(dens.length ? `den_id.is.null,den_id.in.(${dens.join(",")})` : "den_id.is.null")
      .then((x) => ((x.data ?? []) as { id: string; question: string; closes_at: string | null }[]).filter((p) => !p.closes_at || Date.parse(p.closes_at) > now)),
    db
      .from("poll_votes")
      .select("poll_id")
      .in("adult_id", adultIds)
      .then((x) => new Set(((x.data ?? []) as { poll_id: string }[]).map((v) => v.poll_id))),
    eventIds.length
      ? db
          .from("volunteer_slots")
          .select("id, event_id, role_title, shift_label, capacity, signups:volunteer_signups(count)")
          .in("event_id", eventIds)
          .then((x) => (x.data ?? []) as unknown as { id: string; event_id: string; role_title: string; shift_label: string | null; capacity: number; signups: { count: number }[] }[])
      : Promise.resolve([]),
  ]);

  const said = new Map(rsvps.map((x) => [x.event_id, x.status]));
  const going = new Map<string, boolean>();
  for (const m of meetingRsvps) going.set(m.meeting_id, (going.get(m.meeting_id) ?? false) || m.going);
  const word: Record<string, string> = { yes: "Going", no: "Not going", maybe: "Maybe" };

  const toLine = (i: CalItem): Line => {
    const answer = i.kind === "meeting" ? (going.has(i.id) ? (going.get(i.id) ? "Going" : "Not going") : null) : (said.get(i.id) ? word[said.get(i.id)!] : null);
    const open = i.kind === "event" ? Boolean(i.rsvp_enabled) && rsvpOpen(i) : true;
    return {
      when: fmtRange(i.starts_at, i.ends_at, i.all_day),
      title: i.title,
      href: i.kind === "event" ? `${i.href}#rsvp` : i.href,
      where: i.location_name ?? null,
      tag: i.den_name,
      rsvp: answer,
      askRsvp: !answer && open,
    };
  };
  const thisWeek = soon.filter((i) => Date.parse(i.starts_at) < in7).map(toLine);
  const nextWeek = soon.filter((i) => Date.parse(i.starts_at) >= in7).map(toLine);

  // Needs your answer: special events (not regular meetings) without an RSVP.
  const needs: FamilyNews["needs"] = [];
  const unanswered = soon.filter((i) => i.kind === "event" && !ROUTINE.has(i.category) && i.rsvp_enabled && rsvpOpen(i) && !said.has(i.id));
  for (const e of unanswered.slice(0, 4)) {
    needs.push({ text: `RSVP for ${e.title} (${fmtDay(e.starts_at)}${e.rsvp_by ? `, please answer by ${shortDate(e.rsvp_by)}` : ""})`, href: `${e.href}#rsvp`, button: "RSVP" });
  }
  // Permission slips for events they said Going to.
  const slipEvents = soon.filter((i) => i.kind === "event" && i.slip_required && said.get(i.id) === "yes");
  if (slipEvents.length && scouts.length) {
    const { data: slipRows } = await db
      .from("permission_slips")
      .select("event_id, scout_id")
      .in("event_id", slipEvents.map((e) => e.id))
      .in("scout_id", scouts.map((s) => s.id));
    const signed = new Set(((slipRows ?? []) as { event_id: string; scout_id: string }[]).map((x) => `${x.event_id}|${x.scout_id}`));
    const goingScouts = new Map(rsvps.filter((x) => x.status === "yes").map((x) => [x.event_id, Number(x.scouts ?? 0)]));
    const withDen = scouts.map((s) => ({ id: s.id, first_name: s.first_name, den: s.den_id && s.den ? { id: s.den_id, rank: s.den.rank } : null }));
    for (const { event: e, names } of slipsToSign(slipEvents, goingScouts, withDen, signed, now)) {
      needs.push({
        text: `Permission slip for ${e.title}: sign for ${namesList(names)}${e.slip_due ? ` by ${shortDate(e.slip_due)}` : ""}`,
        href: `${e.href}#slip`,
        button: "Sign",
      });
    }
  }
  const owed = charges.reduce((s, c) => s + c.amount_cents, 0);
  if (owed > 0) {
    needs.push({
      text: `${fmtMoney(owed)} due to the pack${charges.length === 1 ? ` (${charges[0].title})` : ` (${charges.length} items)`}`,
      href: "/pay",
      button: "Pay",
    });
  }
  const campout = items.find((i) => i.kind === "event" && i.category === "Campout" && Date.parse(i.starts_at) - now <= 45 * DAY);
  if (campout && scouts.length) {
    const day = easternDate(campout.starts_at);
    const missing = scouts.filter((s) => needsForm(formState(forms.find((f) => f.scout_id === s.id), day > today ? day : undefined)));
    if (missing.length) {
      needs.push({
        text: `Medical forms for ${campout.title}: ${missing.map((s) => s.first_name).join(" and ")} ${missing.length === 1 ? "needs" : "need"} a current form (Parts A and B). Adults who camp need one too.`,
        href: "/family/forms",
        button: "Paperwork",
      });
    }
  }
  const renew = [
    ...scouts.map((s) => ({ name: s.first_name, on: s.registration_expires_on })),
    ...adults.map((a) => ({ name: a.preferred_name || a.first_name, on: a.registration_expires_on })),
  ].filter((x) => needsRenewal(regStatus(x.on)));
  if (renew.length) {
    const soonest = renew.map((x) => x.on!).sort()[0];
    needs.push({
      text: `Scouting America registration for ${renew.map((x) => x.name).join(" and ")} ${regStatus(soonest).state === "expired" ? "expired" : "expires"} ${fmtRegDate(soonest)}. Renew at my.scouting.org.`,
      href: "/family/household",
      button: "Details",
    });
  }
  for (const p of polls.filter((p) => !votes.has(p.id)).slice(0, 2)) {
    needs.push({ text: `Quick poll: ${p.question}`, href: `/polls/${p.id}`, button: "Answer" });
  }

  const titleOf = new Map(soon.map((i) => [i.id, i]));
  const volunteers = slots
    .filter((s) => (s.signups?.[0]?.count ?? 0) < s.capacity)
    .slice(0, 6)
    .map((s) => {
      const e = titleOf.get(s.event_id);
      const left = s.capacity - (s.signups?.[0]?.count ?? 0);
      return {
        text: `${s.role_title}${s.shift_label ? ` (${s.shift_label})` : ""}, ${e ? `${e.title}, ${fmtDay(e.starts_at)}` : "an upcoming event"}${left > 1 ? ` · ${left} spots` : ""}`,
        href: e ? `${e.href}#volunteer` : "/events",
      };
    });

  const special = soon.find((i) => i.kind === "event" && !ROUTINE.has(i.category));
  return {
    familyName: (fam as { family_name: string } | null)?.family_name ?? null,
    thisWeek,
    nextWeek,
    needs,
    announcements: posts.map((p) => ({ title: p.title, body: p.body.replace(/\s+/g, " ").slice(0, 220), den: Boolean(p.den_id) })),
    volunteers,
    highlight: special ? special.title : null,
  };
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------
export interface Newsletter {
  subject: string;
  html: string;
  text: string;
}

export function render(n: FamilyNews, r: Recipient, week: string, preview: boolean): Newsletter {
  const name = r.preferred_name || r.first_name;
  const weekLabel = `Week of ${shortDate(week)}`;
  const subject = n.highlight ? `Pack 361 this week: ${n.highlight}` : `Pack 361 weekly: ${weekLabel.toLowerCase()}`;
  const H = (s: string) => `<h2 style="margin:22px 0 8px;font-size:15px;font-weight:800;color:#012d1d">${esc(s)}</h2>`;
  const btn = (href: string, label: string) =>
    `<a href="${esc(link(href))}" style="display:inline-block;background:#1b4332;color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:5px 10px;border-radius:8px">${esc(label)}</a>`;
  const pill = (s: string, ok: boolean) =>
    `<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:${ok ? "#e8f3ec" : "#f2f2ee"};color:${ok ? "#1b4332" : "#414844"}">${esc(s)}</span>`;
  const lines = (list: Line[]) =>
    list.length
      ? `<table role="presentation" style="width:100%;border-collapse:collapse">${list
          .map(
            (l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e3de;vertical-align:top">
<div style="font-size:12px;color:#414844">${esc(l.when)}${l.tag ? ` · ${esc(l.tag)}` : ""}</div>
<div style="font-size:14px;font-weight:700"><a href="${esc(link(l.href))}" style="color:#012d1d;text-decoration:none">${esc(l.title)}</a></div>
${l.where ? `<div style="font-size:12px;color:#414844">${esc(l.where)}</div>` : ""}</td>
<td style="padding:8px 0 8px 8px;border-bottom:1px solid #e3e3de;text-align:right;vertical-align:top;white-space:nowrap">${
              l.rsvp ? pill(l.rsvp, l.rsvp !== "Not going") : l.askRsvp ? btn(l.href, "RSVP") : ""
            }</td></tr>`,
          )
          .join("")}</table>`
      : `<p style="margin:0;color:#414844;font-size:13px">Nothing on the calendar.</p>`;

  const parts: string[] = [];
  if (preview) {
    parts.push(
      `<p style="margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#fef6e7;color:#7e5700;font-size:12px">Test copy: only the people ticked in Pack admin → Weekly newsletter get this for now.</p>`,
    );
  }
  parts.push(
    `<p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#012d1d">${esc(weekLabel)}</p><p style="margin:0 0 6px;font-size:14px">Hi ${esc(name)}, here&rsquo;s what&rsquo;s coming up${n.familyName ? ` for the ${esc(n.familyName)} family` : ""}.</p>`,
  );
  if (n.needs.length) {
    parts.push(
      `<div style="margin:14px 0 4px;padding:12px;border:1px solid #f6e3bb;background:#fef6e7;border-radius:12px"><div style="font-size:13px;font-weight:800;color:#5c3f00;margin-bottom:6px">Needs your attention</div>${n.needs
        .map(
          (x) =>
            `<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:5px 0;font-size:13px;color:#1b1c19">${esc(x.text)}</td><td style="padding:5px 0 5px 8px;text-align:right;white-space:nowrap">${btn(x.href, x.button)}</td></tr></table>`,
        )
        .join("")}</div>`,
    );
  }
  parts.push(H("This week"), lines(n.thisWeek));
  parts.push(H("Next week"), lines(n.nextWeek));
  if (n.announcements.length) {
    parts.push(
      H("From the pack"),
      n.announcements
        .map(
          (a) =>
            `<div style="padding:6px 0;border-bottom:1px solid #e3e3de"><div style="font-size:14px;font-weight:700">${esc(a.title)}${a.den ? ` <span style="font-size:11px;color:#658a72">(your den)</span>` : ""}</div><div style="font-size:13px;color:#414844">${esc(a.body)}${a.body.length >= 220 ? "…" : ""}</div></div>`,
        )
        .join(""),
      `<p style="margin:8px 0 0;font-size:12px"><a href="${esc(link("/inbox"))}" style="color:#1b4332;font-weight:700">Read them in the app</a></p>`,
    );
  }
  if (n.volunteers.length) {
    parts.push(
      H("Volunteers needed"),
      `<ul style="margin:0;padding-left:18px;font-size:13px">${n.volunteers.map((v) => `<li style="margin:3px 0"><a href="${esc(link(v.href))}" style="color:#1b4332">${esc(v.text)}</a></li>`).join("")}</ul>`,
    );
  }
  parts.push(
    `<p style="margin:24px 0 8px"><a href="${esc(APP_URL)}" style="background:#1b4332;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Open the Pack 361 app</a></p>`,
  );

  const html = `<!doctype html><html><body style="margin:0;background:#faf9f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1c19">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border:1px solid #e3e3de;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1b4332">Cub Scout Pack 361 · Weekly</p>
${parts.join("\n")}
</div>
<p style="font-size:11px;color:#414844;margin:12px 4px">You get this every Sunday because you&rsquo;re on the Pack 361 roster. Questions? Reply to this email or write to info@pack361.org.</p>
</div></body></html>`;

  const t: string[] = [];
  if (preview) t.push("Test copy: only the people ticked in Pack admin get this for now.", "");
  t.push(`Pack 361 · ${weekLabel}`, `Hi ${name}, here's what's coming up${n.familyName ? ` for the ${n.familyName} family` : ""}.`, "");
  if (n.needs.length) t.push("NEEDS YOUR ATTENTION", ...n.needs.map((x) => `- ${x.text} ${link(x.href)}`), "");
  const tl = (list: Line[]) => (list.length ? list.map((l) => `- ${l.when}: ${l.title}${l.where ? `, ${l.where}` : ""}${l.rsvp ? ` [${l.rsvp}]` : l.askRsvp ? ` [RSVP: ${link(l.href)}]` : ""}`) : ["- Nothing on the calendar."]);
  t.push("THIS WEEK", ...tl(n.thisWeek), "", "NEXT WEEK", ...tl(n.nextWeek), "");
  if (n.announcements.length) t.push("FROM THE PACK", ...n.announcements.map((a) => `- ${a.title}: ${a.body}`), "");
  if (n.volunteers.length) t.push("VOLUNTEERS NEEDED", ...n.volunteers.map((v) => `- ${v.text} ${link(v.href)}`), "");
  t.push(`Open the app: ${APP_URL}`);
  return { subject, html, text: t.join("\n") };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
/** pack_settings key holding the week (its Sunday) whose run hasn't reached everyone yet, or "". */
const PENDING_KEY = "newsletter_pending_week";

async function getMode(db: SupabaseClient): Promise<{ mode: NewsletterMode; testIds: string[]; pendingWeek: string | null }> {
  const { data } = await db.from("pack_settings").select("key, value").in("key", ["newsletter_mode", "newsletter_test_adults", PENDING_KEY]);
  const get = (k: string) => ((data ?? []) as { key: string; value: string }[]).find((r) => r.key === k)?.value;
  return { mode: newsletterMode(get("newsletter_mode")), testIds: testAdultIds(get("newsletter_test_adults")), pendingWeek: get(PENDING_KEY) || null };
}

async function setPending(db: SupabaseClient, week: string): Promise<string | null> {
  const { error } = await db.from("pack_settings").upsert({ key: PENDING_KEY, value: week, updated_at: new Date().toISOString() });
  return error ? `Couldn't save the newsletter retry marker: ${error.message}` : null;
}

/** Build one person's newsletter (for a preview). */
export async function buildNewsletter(db: SupabaseClient, adultId: string, preview = true): Promise<Newsletter | null> {
  const { data } = await db.from("adults").select(RECIPIENT_COLS).eq("id", adultId).maybeSingle();
  if (!data) return null;
  const r = data as Recipient;
  return render(await familyNews(db, r), r, weekOf(), preview);
}

/** Email one person their newsletter now (Pack admin → Send me a preview). Not recorded as the week's send. */
export async function sendPreview(db: SupabaseClient, adultId: string): Promise<string | null> {
  const { data } = await db.from("adults").select(RECIPIENT_COLS).eq("id", adultId).maybeSingle();
  if (!data?.email) return "There's no email address on your roster record.";
  const r = data as Recipient;
  const n = render(await familyNews(db, r), r, weekOf(), true);
  const res = await sendPersonal([{ email: r.email, name: `${r.preferred_name || r.first_name} ${r.last_name}`, ...n }]);
  return res.error;
}

/**
 * The Sunday run: everyone the setting covers who hasn't had this week's newsletter yet.
 * Safe to run more than once a week (newsletter_sends records who already got it). Sundays
 * start the week's send; if that run stopped early (the email service refusing), the next
 * days' runs (Mon-Sat of the same week) finish it. Otherwise only Sundays send unless `force`.
 */
export async function runWeeklyNewsletter(db: SupabaseClient, opts: { force?: boolean } = {}) {
  const week = weekOf();
  const sunday = isSundayEastern();
  const { mode, testIds, pendingWeek } = await getMode(db);
  if (!opts.force && !sunday && pendingWeek !== week) return { skipped: "not Sunday" };
  if (mode === "off") return { skipped: "turned off" };
  if (mode === "test" && !testIds.length) return { skipped: "testing, but nobody is ticked" };
  const errors: string[] = [];
  // Mark the week as started, so a run that stops early (or throws) is picked up tomorrow.
  if (pendingWeek !== week) {
    const err = await setPending(db, week);
    if (err) errors.push(err);
  }
  let q = db.from("adults").select(RECIPIENT_COLS).eq("is_active", true).not("email", "is", null);
  if (mode === "test") q = q.in("id", testIds);
  const [{ data: people, error }, { data: done }] = await Promise.all([q, db.from("newsletter_sends").select("adult_id").eq("week_of", week)]);
  if (error) throw new Error(error.message);
  const sent = new Set(((done ?? []) as { adult_id: string }[]).map((d) => d.adult_id));
  const todo = ((people ?? []) as Recipient[]).filter((p) => p.email?.includes("@") && !sent.has(p.id));

  // Build each family's newsletter once and send each adult their own copy.
  const cache = new Map<string, FamilyNews>();
  let ok = 0;
  let unrecorded = false;
  for (const r of todo) {
    const key = r.family_id ?? `adult:${r.id}`;
    try {
      if (!cache.has(key)) cache.set(key, await familyNews(db, r));
      const n = render(cache.get(key)!, r, week, mode === "test");
      const res = await sendPersonal([{ email: r.email, name: `${r.preferred_name || r.first_name} ${r.last_name}`, ...n }]);
      if (res.error) {
        errors.push(res.error);
        if (errors.length >= 3) break; // the email service is refusing; try again next run
        continue;
      }
      ok++;
      const { error: insErr } = await db.from("newsletter_sends").insert({ adult_id: r.id, week_of: week });
      if (insErr) {
        // Sent but not recorded: a retry would send it again, so stop here rather than keep
        // sending emails nothing remembers.
        errors.push(`Sent to ${r.email} but couldn't record it (they may get it twice): ${insErr.message}`);
        unrecorded = true;
        break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "failed");
      if (errors.length >= 3) break;
    }
  }
  const waiting = todo.length - ok;
  // Everyone reached (and recorded): nothing for the rest of the week's runs to finish.
  if (!waiting && !unrecorded) {
    const err = await setPending(db, "");
    if (err) errors.push(err);
  }
  return { mode, week, sent: ok, waiting, errors: [...new Set(errors)].slice(0, 4) };
}
