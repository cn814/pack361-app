import "server-only";
import { emailConfigured, renderEmailHtml, sendEmails } from "./email";
import { betaEmailFilter } from "./beta";

// Email to many families at once. The main email service (Resend, free plan) allows only 100
// emails a day and is kept for sign-in codes, reminders and welcome emails. Pack-wide and den
// emails go through Brevo's free plan (300 a day) when BREVO_API_KEY is set.

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

/** Whether a pack-wide email can go out (the pack has more adults than Resend's daily limit). */
export function packEmailConfigured(): boolean {
  return brevoConfigured();
}

export interface BulkRecipient {
  email: string;
  name?: string;
}

export interface BulkEmail {
  subject: string;
  paragraphs: string[];
  replyTo?: string;
}

function sender(): { name: string; email: string } {
  const raw = process.env.BREVO_SENDER ?? process.env.EMAIL_FROM ?? "Pack 361 <noreply@pack361.org>";
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || "Pack 361", email: m[2] } : { name: "Pack 361", email: raw.trim() };
}

async function brevo(list: BulkRecipient[], e: BulkEmail): Promise<string | null> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!.trim(), "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      sender: sender(),
      subject: e.subject,
      htmlContent: renderEmailHtml({ to: "", ...e }),
      textContent: e.paragraphs.join("\n\n"),
      replyTo: { email: e.replyTo ?? process.env.EMAIL_REPLY_TO ?? "app@pack361.org" },
      // One version per person: each gets their own copy (nobody sees the other addresses).
      messageVersions: list.map((r) => ({ to: [{ email: r.email, ...(r.name ? { name: r.name } : {}) }] })),
    }),
  }).catch(() => null);
  if (!res) return "Couldn't reach the email service.";
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? `Email service error ${res.status}`;
}

/** Send the same email to everyone on the list. Returns how many went out and any error. */
export async function sendBulk(list: BulkRecipient[], e: BulkEmail): Promise<{ sent: number; error: string | null }> {
  const unique = await betaEmailFilter([...new Map(list.filter((r) => r.email).map((r) => [r.email.toLowerCase(), r])).values()], (r) => r.email);
  if (!unique.length) return { sent: 0, error: null };
  if (brevoConfigured()) {
    let sent = 0;
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const error = await brevo(chunk, e);
      if (error) return { sent, error };
      sent += chunk.length;
    }
    return { sent, error: null };
  }
  // No Brevo: small groups (a den) can still go through the main service.
  if (!emailConfigured()) return { sent: 0, error: "Email isn't set up." };
  if (unique.length > 60) return { sent: 0, error: "Too many people for the main email service. Add BREVO_API_KEY for pack-wide email." };
  const error = await sendEmails(unique.map((r) => ({ to: r.email, subject: e.subject, paragraphs: e.paragraphs, replyTo: e.replyTo })));
  return { sent: error ? 0 : unique.length, error };
}

export interface PersonalEmail {
  email: string;
  name?: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Emails that differ per person (the weekly newsletter): one request each through Brevo, or
 * the main service for a handful when Brevo isn't set up.
 */
export async function sendPersonal(list: PersonalEmail[]): Promise<{ sent: number; error: string | null }> {
  list = await betaEmailFilter(list, (m) => m.email);
  if (!list.length) return { sent: 0, error: null };
  if (brevoConfigured()) {
    let sent = 0;
    for (const m of list) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!.trim(), "Content-Type": "application/json", Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          sender: sender(),
          to: [{ email: m.email, ...(m.name ? { name: m.name } : {}) }],
          subject: m.subject,
          htmlContent: m.html,
          textContent: m.text,
          replyTo: { email: process.env.EMAIL_REPLY_TO ?? "app@pack361.org" },
        }),
      }).catch(() => null);
      if (!res) return { sent, error: "Couldn't reach the email service." };
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        return { sent, error: body.message ?? `Email service error ${res.status}` };
      }
      sent++;
    }
    return { sent, error: null };
  }
  if (!emailConfigured()) return { sent: 0, error: "Email isn't set up." };
  if (list.length > 20) return { sent: 0, error: "Add BREVO_API_KEY to send this many personal emails." };
  const error = await sendEmails(list.map((m) => ({ to: m.email, subject: m.subject, paragraphs: m.text.split("\n\n"), html: m.html })));
  return { sent: error ? 0 : list.length, error };
}
