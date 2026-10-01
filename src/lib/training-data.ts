import "server-only";
import { createClient } from "./supabase/server";
import type { Adult, AppRole } from "./types";
import { positionsFor, type PositionKey, type TrainingRow } from "./training";

export interface TrainedAdult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  role: AppRole;
  position_title: string | null;
  bsa_member_id: string | null;
  dens: string[];
  positions: PositionKey[];
  trainings: TrainingRow[];
}

type DenLeaderRow = { adult_id: string; title: string; den: { name: string; is_active: boolean } | null };

/**
 * Adults the pack tracks training for: anyone with a leader role, a pack position,
 * or a den leader assignment. (Leaders only; RLS hides other adults' training.)
 */
export async function getLeaderTraining(): Promise<TrainedAdult[]> {
  const supabase = await createClient();
  const [{ data: adults }, { data: rows }, { data: dl }] = await Promise.all([
    supabase
      .from("adults")
      .select("id, first_name, last_name, preferred_name, role, position_title, bsa_member_id")
      .eq("is_active", true)
      .order("last_name"),
    supabase.from("adult_trainings").select("adult_id, course, completed_on, expires_on"),
    supabase.from("den_leaders").select("adult_id, title, den:dens(name, is_active)"),
  ]);
  const densBy = new Map<string, { name: string; title: string }[]>();
  for (const r of (dl ?? []) as unknown as DenLeaderRow[]) {
    if (r.den?.is_active) densBy.set(r.adult_id, [...(densBy.get(r.adult_id) ?? []), { name: r.den.name, title: r.title }]);
  }
  const tBy = new Map<string, TrainingRow[]>();
  for (const r of (rows ?? []) as TrainingRow[]) tBy.set(r.adult_id, [...(tBy.get(r.adult_id) ?? []), r]);
  return ((adults ?? []) as Omit<TrainedAdult, "dens" | "positions" | "trainings">[])
    .map((a) => {
      const dens = densBy.get(a.id) ?? [];
      return {
        ...a,
        dens: dens.map((d) => d.name),
        positions: positionsFor({ role: a.role, position_title: a.position_title, denTitles: dens.map((d) => d.title) }),
        trainings: tBy.get(a.id) ?? [],
      };
    })
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

/** The signed-in adult's scouting positions and BSA member ID. */
export async function getMyPositions(me: Adult): Promise<{ positions: PositionKey[]; memberId: string | null }> {
  const supabase = await createClient();
  const [{ data: dl }, { data: row }] = await Promise.all([
    supabase.from("den_leaders").select("title, den:dens(is_active)").eq("adult_id", me.id),
    supabase.from("adults").select("bsa_member_id").eq("id", me.id).maybeSingle(),
  ]);
  const denTitles = ((dl ?? []) as unknown as { title: string; den: { is_active: boolean } | null }[])
    .filter((d) => d.den?.is_active)
    .map((d) => d.title);
  return {
    positions: positionsFor({ role: me.role, position_title: me.position_title, denTitles }),
    memberId: (row?.bsa_member_id as string | null) ?? null,
  };
}

export interface ImportAdult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  bsa_member_id: string | null;
  trainings: TrainingRow[];
}

/** Every active adult with their member ID and training, for matching a my.scouting report. */
export async function getImportRoster(): Promise<ImportAdult[]> {
  const supabase = await createClient();
  const [{ data: adults }, { data: rows }] = await Promise.all([
    supabase
      .from("adults")
      .select("id, first_name, last_name, preferred_name, bsa_member_id")
      .eq("is_active", true)
      .order("last_name"),
    supabase.from("adult_trainings").select("adult_id, course, completed_on, expires_on"),
  ]);
  const tBy = new Map<string, TrainingRow[]>();
  for (const r of (rows ?? []) as TrainingRow[]) tBy.set(r.adult_id, [...(tBy.get(r.adult_id) ?? []), r]);
  return ((adults ?? []) as Omit<ImportAdult, "trainings">[]).map((a) => ({ ...a, trainings: tBy.get(a.id) ?? [] }));
}
