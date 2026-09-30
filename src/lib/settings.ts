import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type SettingKey = "awards_tracked_from";

const DEFAULTS: Record<SettingKey, string> = {
  awards_tracked_from: "2026-07-01",
};

/** Pack-wide settings (members read, admins change). */
export const getSettings = cache(async (): Promise<Record<SettingKey, string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("pack_settings").select("key, value");
  const out = { ...DEFAULTS };
  for (const row of data ?? []) {
    if (row.key in out) out[row.key as SettingKey] = row.value as string;
  }
  return out;
});
