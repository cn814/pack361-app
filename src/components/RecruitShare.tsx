"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Contact, Copy, Mail, MessageSquare, Share2 } from "lucide-react";

type ContactInfo = { tel?: string[]; email?: string[] };
type ContactsApi = { select: (props: string[], opts: { multiple: boolean }) => Promise<ContactInfo[]> };

const SUBJECT = "Come check out Cub Scout Pack 361";

interface Device {
  canShare: boolean;
  contacts: ContactsApi | null;
  apple: boolean;
}

const noop = () => () => {};
let cached: Device | null = null;
/** What this phone or browser can do (read once; it doesn't change while the page is open). */
function detect(): Device {
  if (!cached) {
    const nav = navigator as Navigator & { contacts?: ContactsApi };
    cached = {
      canShare: typeof nav.share === "function",
      contacts: nav.contacts && typeof nav.contacts.select === "function" ? nav.contacts : null,
      apple: /iPhone|iPad|Macintosh/.test(nav.userAgent),
    };
  }
  return cached;
}

/**
 * Invite a family: share the pack's public page with a friendly message. Uses the phone's share
 * sheet, a text, an email, or a copied link. On phones that allow it (Android Chrome), pick
 * people from your contacts; their numbers go straight to your messaging app and never reach
 * the pack.
 */
export default function RecruitShare({ link, message }: { link: string; message: string }) {
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);
  const device = useSyncExternalStore<Device | null>(noop, detect, () => null);
  const canShare = device?.canShare ?? false;
  const contacts = device?.contacts ?? null;
  const isApple = device?.apple ?? false;

  // iPhones want sms:&body=, Android sms:?body=.
  const sms = (to = "") => `sms:${to}${isApple ? "&" : "?"}body=${encodeURIComponent(text)}`;
  const mail = (to = "") => `mailto:${to}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(text)}`;

  async function share() {
    try {
      await navigator.share({ title: SUBJECT, text });
    } catch {
      // closed the share sheet
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function pick() {
    if (!contacts) return;
    try {
      const chosen = await contacts.select(["tel", "email"], { multiple: true });
      const tels = chosen.map((c) => c.tel?.[0]).filter((x): x is string => Boolean(x));
      const emails = chosen.map((c) => c.email?.[0]).filter((x): x is string => Boolean(x));
      if (tels.length) window.location.href = sms(tels.map((t) => t.replace(/[^\d+]/g, "")).join(","));
      else if (emails.length) window.location.href = mail(emails.join(","));
    } catch {
      // closed the contact picker
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Your message (change it however you like)</span>
        <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {canShare && (
          <button type="button" onClick={share} className="btn-primary col-span-2 py-2.5">
            <Share2 className="h-4 w-4" aria-hidden /> Share…
          </button>
        )}
        {contacts && (
          <button type="button" onClick={pick} className="btn-ghost col-span-2 py-2.5">
            <Contact className="h-4 w-4" aria-hidden /> Pick from my contacts
          </button>
        )}
        <a href={sms()} className="btn-ghost py-2.5">
          <MessageSquare className="h-4 w-4" aria-hidden /> Text it
        </a>
        <a href={mail()} className="btn-ghost py-2.5">
          <Mail className="h-4 w-4" aria-hidden /> Email it
        </a>
        <button type="button" onClick={copy} className="btn-ghost col-span-2 py-2.5">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy the message"}
        </button>
      </div>
      <p className="text-[11px] text-muted">
        The link goes to the pack&apos;s public page: <span className="font-semibold text-ink">{link}</span>. Nothing about your
        family or your contacts is shared with the pack or anyone else.
      </p>
    </div>
  );
}
