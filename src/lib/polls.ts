import "server-only";
import { createClient } from "./supabase/server";

export interface Poll {
  id: string;
  question: string;
  details: string | null;
  options: string[];
  allow_multiple: boolean;
  one_per_family: boolean;
  den_id: string | null;
  results_visible: "voters" | "leaders";
  closes_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  den: { name: string } | null;
}

const COLS = "id, question, details, options, allow_multiple, one_per_family, den_id, results_visible, closes_at, closed_at, created_by, created_at, den:dens(name)";

export function isOpen(p: Poll): boolean {
  return !p.closed_at && (!p.closes_at || new Date(p.closes_at).getTime() > Date.now());
}

/** Polls the signed-in person can see (RLS), newest first. */
export async function getPolls(limit = 50): Promise<Poll[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("polls").select(COLS).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as Poll[];
}

export async function getPoll(id: string): Promise<Poll | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("polls").select(COLS).eq("id", id).maybeSingle();
  return (data as unknown as Poll | null) ?? null;
}

/** Poll ids this person (or, for one-per-family polls, their family) already answered. */
export async function getVotedPollIds(me: { id: string; family_id: string | null }): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("poll_votes").select("poll_id, adult_id").eq("adult_id", me.id);
  return new Set((data ?? []).map((v) => v.poll_id as string));
}

/** Counts per answer, or null when this person can't see results yet. */
export async function getResults(id: string): Promise<{ counts: number[]; voters: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("poll_results", { p_poll_id: id });
  const rows = (data ?? []) as { option_index: number; votes: number; voters: number }[];
  if (!rows.length) return null;
  const counts: number[] = [];
  for (const r of rows) counts[r.option_index] = Number(r.votes);
  return { counts, voters: Number(rows[0].voters) };
}

export async function getMyVote(pollId: string, adultId: string): Promise<number[] | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("poll_votes").select("choices").eq("poll_id", pollId).eq("adult_id", adultId).maybeSingle();
  return (data?.choices as number[] | undefined) ?? null;
}

/** Leaders: who picked what. */
export async function getVoters(pollId: string): Promise<{ name: string; choices: number[] }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("poll_votes")
    .select("choices, voted_at, adult:adults(first_name, preferred_name, last_name)")
    .eq("poll_id", pollId)
    .order("voted_at");
  return ((data ?? []) as unknown as { choices: number[]; adult: { first_name: string; preferred_name: string | null; last_name: string } | null }[]).map(
    (v) => ({ name: v.adult ? `${v.adult.preferred_name || v.adult.first_name} ${v.adult.last_name}` : "Someone", choices: v.choices }),
  );
}
