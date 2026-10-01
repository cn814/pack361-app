import "server-only";
import { cache } from "react";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { isBeta } from "./version";

// The beta site (beta.pack361.org) runs newer code against the pack's real database. Only the
// testers picked in Pack admin (and the admins) can use it, and nothing it sends (emails, alerts)
// reaches anyone else, so families never see a half-finished feature.

export interface Testers {
  ids: Set<string>;
  emails: Set<string>;
}

/** Beta testers: the adults ticked in Pack admin → Beta site, plus every admin and the Cubmaster. */
export const getTesters = cache(async (): Promise<Testers> => {
  const out: Testers = { ids: new Set(), emails: new Set() };
  if (!adminConfigured()) return out;
  const db = createAdminClient();
  const { data: row } = await db.from("pack_settings").select("value").eq("key", "beta_testers").maybeSingle();
  const picked = String(row?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const { data } = await db
    .from("adults")
    .select("id, email, role")
    .eq("is_active", true)
    .or(`role.in.(admin,cubmaster)${picked.length ? `,id.in.(${picked.join(",")})` : ""}`);
  for (const a of (data ?? []) as { id: string; email: string }[]) {
    out.ids.add(a.id);
    if (a.email) out.emails.add(a.email.toLowerCase());
  }
  return out;
});

/** On the beta site, keep only testers' email addresses. On the live site, everyone. */
export async function betaEmailFilter<T>(list: T[], email: (x: T) => string): Promise<T[]> {
  if (!isBeta()) return list;
  const t = await getTesters();
  return list.filter((x) => t.emails.has(email(x).toLowerCase()));
}

/** On the beta site, keep only testers' adult ids (null = "everyone" becomes the testers). */
export async function betaAdultFilter(ids: string[] | null): Promise<string[] | null> {
  if (!isBeta()) return ids;
  const t = await getTesters();
  return ids ? ids.filter((id) => t.ids.has(id)) : [...t.ids];
}
