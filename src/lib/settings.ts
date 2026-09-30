import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type SettingKey = "awards_tracked_from" | "photo_keep_months" | "email_daily_limit";

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  awards_tracked_from: "2026-07-01",
  photo_keep_months: "24",
  email_daily_limit: "80",
};
const DEFAULTS = SETTING_DEFAULTS;

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
