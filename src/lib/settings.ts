import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type SettingKey =
  | "awards_tracked_from"
  | "photo_keep_months"
  | "left_family_months"
  | "email_daily_limit"
  | "dues_season"
  | "registration_year"
  | "dues_amount_cents"
  | "national_youth_cents"
  | "national_adult_cents"
  | "council_youth_cents"
  | "council_adult_cents"
  | "pay_other_how"
  | "dues_givebutter_campaign_id"
  | "dues_sibling_discount_cents"
  | "registration_billing"
  | "newsletter_mode"
  | "public_site_url"
  | "newsletter_test_adults"
  | "beta_testers"
  | "pilot_only"
  | "pilot_people"
  | "training_last_import"
  | "training_import_reminded";

// Fee amounts start at 0 (pack dues at $255 per scout): leaders keep them up to date on Leaders → Money.
export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  awards_tracked_from: "2026-07-01",
  photo_keep_months: "24",
  left_family_months: "24",
  email_daily_limit: "40",
  dues_season: "2026-27",
  registration_year: "",
  dues_amount_cents: "25500",
  national_youth_cents: "0",
  national_adult_cents: "0",
  council_youth_cents: "0",
  council_adult_cents: "0",
  pay_other_how: "",
  dues_givebutter_campaign_id: "",
  dues_sibling_discount_cents: "1000",
  registration_billing: "off",
  newsletter_mode: "admins",
  public_site_url: "https://app.pack361.org/join",
  newsletter_test_adults: "",
  beta_testers: "",
  pilot_only: "",
  pilot_people: "",
  training_last_import: "",
  training_import_reminded: "",
};
const DEFAULTS = SETTING_DEFAULTS;

/** Pack-wide settings (members read; admins change, and key leaders change the payment ones). */
export const getSettings = cache(async (): Promise<Record<SettingKey, string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("pack_settings").select("key, value");
  const out = { ...DEFAULTS };
  for (const row of data ?? []) {
    if (row.key in out) out[row.key as SettingKey] = row.value as string;
  }
  return out;
});

/** A *_cents setting as a number (0 if unset or not a number). */
export function settingCents(settings: Record<SettingKey, string>, key: SettingKey): number {
  const n = Number(settings[key]);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
