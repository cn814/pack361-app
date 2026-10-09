import "server-only";
import { createClient } from "./supabase/server";

/** Downloads recorded in the security log (Pack admin → Security log). */
export type DownloadName = "roster" | "membership" | "training" | "medical_forms" | "attendance" | "money" | "finance_report";

/**
 * Record a spreadsheet download before the file goes out. Best effort: a failure here never
 * stops the download (the database still decides who may read the data).
 */
export async function logDownload(what: DownloadName): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_download", { p_what: what });
  } catch {
    // The log is a record, not a gate.
  }
}

export interface SecurityLogRow {
  id: number;
  at: string;
  actor_name: string | null;
  action: string;
  subject: string | null;
  detail: Record<string, unknown>;
}

/** The latest entries (admins only: the database returns nothing to anyone else). */
export async function getSecurityLog(limit = 300): Promise<SecurityLogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("security_log")
    .select("id, at, actor_name, action, subject, detail")
    .order("at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SecurityLogRow[];
}
