import "server-only";
import { createClient } from "./supabase/server";

const RANK_ORDER = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];

/** Active scouts by den, for an event's "Only some scouts" (leaders). */
export async function getEventFormScouts(): Promise<{ id: string; name: string; den_id: string | null; den_name: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("scouts").select("id, first_name, last_name, den:dens(id, name, rank, number)").eq("is_active", true);
  const rows = (data ?? []) as unknown as { id: string; first_name: string; last_name: string; den: { id: string; name: string; rank: string; number: number } | null }[];
  return rows
    .sort(
      (a, b) =>
        (a.den ? RANK_ORDER.indexOf(a.den.rank) : 9) - (b.den ? RANK_ORDER.indexOf(b.den.rank) : 9) ||
        (a.den?.number ?? 0) - (b.den?.number ?? 0) ||
        a.first_name.localeCompare(b.first_name),
    )
    .map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name.slice(0, 1)}.`, den_id: s.den?.id ?? null, den_name: s.den?.name ?? null }));
}
