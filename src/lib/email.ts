import "server-only";
import { startOfEasternDay } from "./tz";

// Pack email goes out through Resend (the same service that sends sign-in codes).
// Needs RESEND_API_KEY in the server environment; without it, email features stay switched off.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pack361.org";
const FROM = process.env.EMAIL_FROM ?? "Pack 361 <noreply@pack361.org>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "info@pack361.org";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface Email {
  to: string;
  subject: string;
  /** Paragraphs of plain text; a paragraph that is exactly a URL becomes a button. */
  paragraphs: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function html(e: Email): string {
  const body = e.paragraphs
    .map((p) =>
      /^https?:\/\/\S+$/.test(p)
        ? `<p style="margin:24px 0"><a href="${esc(p)}" style="background:#1b4332;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Open the Pack 361 app</a></p>`
        : `<p style="margin:0 0 14px;line-height:1.5">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#faf9f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1c19">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fff;border:1px solid #e3e3de;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1b4332">Cub Scout Pack 361</p>
${body}
</div>
<p style="font-size:11px;color:#414844;margin:12px 4px">Pack 361, Ellicott City MD. Questions? Reply to this email or write to ${esc(REPLY_TO)}.</p>
</div></body></html>`;
}

/** Send one email. Returns an error message, or null when it was accepted. */
export async function sendEmail(e: Email): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Email isn't set up yet (RESEND_API_KEY).";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: FROM,
        to: [e.to],
        reply_to: REPLY_TO,
        subject: e.subject,
        html: html(e),
        text: e.paragraphs.join("\n\n"),
      }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message ?? `Email service error ${res.status}`;
  } catch {
    return "Couldn't reach the email service.";
  }
}

/** Send up to 100 emails in one request (Resend batch API). Returns an error message or null. */
export async function sendEmails(list: Email[]): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Email isn't set up yet (RESEND_API_KEY).";
  if (!list.length) return null;
  if (list.length > 100) return "Send at most 100 emails at a time.";
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(
        list.map((e) => ({
          from: FROM,
          to: [e.to],
          reply_to: REPLY_TO,
          subject: e.subject,
          html: html(e),
          text: e.paragraphs.join("\n\n"),
        })),
      ),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message ?? `Email service error ${res.status}`;
  } catch {
    return "Couldn't reach the email service.";
  }
}

/** Start of today in Eastern time, as an ISO timestamp (for "sent today" counts). */
export function startOfTodayEastern(): string {
  return startOfEasternDay();
}
