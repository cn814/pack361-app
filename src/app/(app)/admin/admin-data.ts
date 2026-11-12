import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Supabase's free plan includes 1 GB of file storage, shared by every bucket. */
export async function storageUse() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("storage_usage");
  const usage = (data ?? []) as { bucket_id: string; bytes: number }[];
  const bytesIn = (bucket: string) => Number(usage.find((u) => u.bucket_id === bucket)?.bytes ?? 0);
  const photos = bytesIn("pack-photos");
  const docs = bytesIn("pack-docs");
  const total = usage.reduce((n, u) => n + Number(u.bytes), 0);
  return { photos, docs, other: Math.max(0, total - photos - docs), total, percent: Math.round(Math.min(100, (total / 1e9) * 100)) };
}

export const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
export const pctOfGb = (n: number) => Math.min(100, (n / 1e9) * 100);

function readJson<T>(rows: { key: string; value: unknown }[] | null, key: string): T | null {
  try {
    const v = rows?.find((r) => r.key === key)?.value;
    return v ? (JSON.parse(v as string) as T) : null;
  } catch {
    return null;
  }
}

/** The last TroopWebHost sync and nightly run, as the jobs saved them. */
export async function jobRuns() {
  const supabase = await createClient();
  const { data } = await supabase.from("pack_settings").select("key, value").in("key", ["twh_last_sync", "daily_last_run"]);
  return {
    lastSync: readJson<{ at: string; feed: number; skipped?: string; errors?: string[] }>(data, "twh_last_sync"),
    lastRun: readJson<{ at: string; ok: boolean; failed: string[]; reasons?: Record<string, string>; running?: string | null }>(data, "daily_last_run"),
  };
}

/** What went wrong in the last nightly run, or null. A run still "running" well past the 5-minute limit was cut off. */
export async function nightlyProblem(): Promise<{ at: string; steps: string[] } | null> {
  const { lastRun } = await jobRuns();
  if (!lastRun) return null;
  const cutOff = lastRun.running && Date.parse(lastRun.at) < Date.now() - 10 * 60000 ? lastRun.running : null;
  if (!cutOff && (lastRun.running || lastRun.ok)) return null;
  return {
    at: lastRun.at,
    steps: [...lastRun.failed.map((f) => (lastRun.reasons?.[f] ? `${f} (${lastRun.reasons[f]})` : f)), ...(cutOff ? [`${cutOff} (didn't finish)`] : [])],
  };
}
