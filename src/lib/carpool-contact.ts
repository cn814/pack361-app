// Turning the contact a family typed on a carpool post into a link (no server code, so it's testable).

/**
 * A contact someone typed: a text-message link when it looks like a phone number (with a starter
 * message about the event), a mailto: link when it's an email, else nothing.
 */
export function contactHref(contact: string, eventTitle?: string): { href: string; kind: "text" | "email" } | null {
  const c = contact.trim();
  const body = eventTitle ? `Hi! I saw your carpool post for ${eventTitle} in the Pack 361 app.` : "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) {
    return { href: `mailto:${c}${body ? `?subject=${encodeURIComponent(`Carpool: ${eventTitle}`)}&body=${encodeURIComponent(body)}` : ""}`, kind: "email" };
  }
  const digits = c.replace(/[^\d+]/g, "");
  if (/^\+?\d{10,15}$/.test(digits) && !/[a-z]/i.test(c)) {
    // "?&body=" works in both iPhone Messages and Android.
    return { href: `sms:${digits}${body ? `?&body=${encodeURIComponent(body)}` : ""}`, kind: "text" };
  }
  return null;
}
