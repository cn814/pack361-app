import "server-only";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { TWO_STEP_ROLES, type AppRole } from "./types";
import type { createClient } from "./supabase/server";

export interface TwoStepPerson {
  id: string;
  name: string;
  role: AppRole;
  signedUp: boolean;
  apps: number;
  lastUsed: string | null;
}

/** Pack admin: every leader who needs two-step sign-in, and how many authenticator apps they have. */
export async function getTwoStepPeople(): Promise<TwoStepPerson[] | null> {
  if (!adminConfigured()) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("adults")
    .select("id, first_name, preferred_name, last_name, role, user_id")
    .eq("is_active", true)
    .in("role", TWO_STEP_ROLES)
    .order("last_name");
  const rows = (data ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string; role: AppRole; user_id: string | null }[];
  return Promise.all(
    rows.map(async (a) => {
      let apps = 0;
      let lastUsed: string | null = null;
      if (a.user_id) {
        const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: a.user_id });
        const verified = (f?.factors ?? []).filter((x) => x.factor_type === "totp" && x.status === "verified");
        apps = verified.length;
        lastUsed = verified.map((x) => x.last_challenged_at ?? "").sort().pop() || null;
      }
      return {
        id: a.id,
        name: `${a.preferred_name || a.first_name} ${a.last_name}`,
        role: a.role,
        signedUp: !!a.user_id,
        apps,
        lastUsed,
      };
    }),
  );
}

/** Remove all of someone's authenticator apps (lost phone). They set it up again at their next sign-in. */
export async function resetTwoStepFor(adultId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("adults").select("user_id").eq("id", adultId).maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id;
  if (!userId) return "They haven't signed in yet, so there's nothing to reset.";
  const { data: f, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return "Couldn't read their sign-in settings.";
  for (const factor of f?.factors ?? []) {
    const { error: e } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (e) return "Couldn't remove one of their apps. Try again.";
  }
  return null;
}

/**
 * Right after the email code or link: does this person still need their authenticator code?
 * Leaders do (the email alone only gets them part way), so sign-in sends them straight to the
 * two-step page, and the welcome animation waits until they're all the way in.
 * `supabase` is the client that just signed them in.
 */
export async function needsTwoStepAfterEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from("adults").select("role").eq("user_id", userId).eq("is_active", true).maybeSingle();
  const role = (data as { role?: AppRole } | null)?.role;
  return !!role && TWO_STEP_ROLES.includes(role);
}
