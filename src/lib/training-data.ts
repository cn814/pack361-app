import "server-only";
import { createClient } from "./supabase/server";
import type { AppRole } from "./types";
import type { TrainingRow } from "./training";

export interface TrainedAdult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  role: AppRole;
  position_title: string | null;
  dens: string[];
  trainings: TrainingRow[];
}

/**
 * Adults the pack tracks training for: anyone with a leader role, a pack position,
 * or a den leader assignment. (Leaders only; RLS hides other adults' training.)
 */
export async function getLeaderTraining(): Promise<TrainedAdult[]> {
  const supabase = await createClient();
  const [{ data: adults }, { data: rows }, { data: dl }] = await Promise.all([
    supabase
      .from("adults")
      .select("id, first_name, last_name, preferred_name, role, position_title")
      .eq("is_active", true)
      .order("last_name"),
    supabase.from("adult_trainings").select("adult_id, course, completed_on, expires_on"),
    supabase.from("den_leaders").select("adult_id, den:dens(name, is_active)"),
  ]);
  const densBy = new Map<string, string[]>();
  for (const r of (dl ?? []) as unknown as { adult_id: string; den: { name: string; is_active: boolean } | null }[]) {
    if (r.den?.is_active) densBy.set(r.adult_id, [...(densBy.get(r.adult_id) ?? []), r.den.name]);
  }
  const tBy = new Map<string, TrainingRow[]>();
  for (const r of (rows ?? []) as TrainingRow[]) tBy.set(r.adult_id, [...(tBy.get(r.adult_id) ?? []), r]);
  return ((adults ?? []) as Omit<TrainedAdult, "dens" | "trainings">[])
    .map((a) => ({ ...a, dens: densBy.get(a.id) ?? [], trainings: tBy.get(a.id) ?? [] }))
    .filter((a) => a.role !== "parent" || a.position_title || a.dens.length || a.trainings.length);
}

export async function getMyTraining(adultId: string): Promise<TrainingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("adult_trainings")
    .select("adult_id, course, completed_on, expires_on")
    .eq("adult_id", adultId);
  return (data ?? []) as TrainingRow[];
}
