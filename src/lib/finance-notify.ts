import "server-only";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { APP_URL, emailConfigured, sendEmails } from "./email";
import { sendPushTo } from "./push";
import { notifyAdmins } from "./notify";
import { fmtMoney } from "./money";
import { PAID_VIA_LABEL, type PaidVia } from "./finance";

const longDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

type Person = { id: string; email: string; first_name: string; preferred_name: string | null };

/**
 * Who hears about new reimbursement requests: key leaders whose position mentions
 * "treasurer". With no treasurer on the roster, the pack admins and Cubmaster.
 */
async function treasurers(): Promise<Person[]> {
  if (!adminConfigured()) return [];
  const { data } = await createAdminClient()
    .from("adults")
    .select("id, email, first_name, preferred_name")
    .in("role", ["committee", "cubmaster", "admin"])
    .eq("is_active", true)
    .ilike("position_title", "%treasurer%");
  return (data ?? []) as Person[];
}

/** Someone asked to be paid back: a phone alert and an email for the treasurer. Best effort. */
export async function notifyNewRequest(r: { who: string; amountCents: number; description: string; requesterId: string }) {
  try {
    const url = `${APP_URL}/leaders/money/expenses`;
    const subject = `Reimbursement request: ${fmtMoney(r.amountCents)} from ${r.who}`;
    const paragraphs = [
      `${r.who} asked to be paid back ${fmtMoney(r.amountCents)} for “${r.description}”.`,
      "Review it, then approve and pay it or decline it, in the app under Leaders, Money, Expenses.",
      url,
    ];
    const list = (await treasurers()).filter((t) => t.id !== r.requesterId);
    if (!list.length) {
      await notifyAdmins({ title: "Reimbursement request", body: subject, url: "/leaders/money/expenses", tag: "reimburse" }, { subject, paragraphs });
      return;
    }
    await sendPushTo(
      list.map((t) => t.id),
      { title: "Reimbursement request", body: subject, url: "/leaders/money/expenses", tag: "reimburse" },
    );
    if (emailConfigured()) await sendEmails(list.map((t) => ({ to: t.email, subject, paragraphs })));
  } catch {
    // Notifications never block saving the request.
  }
}

/** Tell the person who asked that their request was paid or declined. Best effort. */
export async function notifyDecision(r: {
  adultId: string;
  amountCents: number;
  description: string;
  outcome: "paid" | "declined";
  paidVia?: PaidVia | null;
  paidOn?: string | null;
  reason?: string | null;
}) {
  try {
    if (!adminConfigured()) return;
    const { data } = await createAdminClient()
      .from("adults")
      .select("id, email, first_name, preferred_name")
      .eq("id", r.adultId)
      .eq("is_active", true)
      .maybeSingle();
    const p = data as Person | null;
    if (!p) return;
    const name = p.preferred_name || p.first_name;
    const what = `${fmtMoney(r.amountCents)} for “${r.description}”`;
    const subject = r.outcome === "paid" ? `You've been paid back ${fmtMoney(r.amountCents)}` : "About your reimbursement request";
    const paragraphs =
      r.outcome === "paid"
        ? [
            `Hi ${name},`,
            `The pack paid you back ${what}${r.paidVia ? ` by ${PAID_VIA_LABEL[r.paidVia].toLowerCase()}` : ""}${r.paidOn ? ` on ${longDate(r.paidOn)}` : ""}. Thank you for helping the pack!`,
            `${APP_URL}/reimburse`,
          ]
        : [
            `Hi ${name},`,
            `Your request to be paid back ${what} was declined.${r.reason ? ` The note from a key leader: “${r.reason}”` : ""}`,
            "Questions? Reply to this email or talk to the pack treasurer.",
            `${APP_URL}/reimburse`,
          ];
    await sendPushTo([p.id], { title: subject, body: what, url: "/reimburse", tag: "reimburse" });
    if (emailConfigured() && p.email) await sendEmails([{ to: p.email, subject, paragraphs }]);
  } catch {
    // Best effort.
  }
}
