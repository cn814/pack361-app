import "server-only";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";

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

/**
 * Poll ids this person (or, for one-per-family polls, their family) already answered. Mirrors
 * poll_results(): on a one-per-family poll a vote by any adult in the family counts (cast_vote
 * keeps only the latest one). RLS (poll_votes_read) only shows a parent their own votes, so the
 * co-parent's are read with the secret key, limited to polls this person can see (RLS on polls),
 * that are one-per-family, and to adults in this person's family; only poll ids come back.
 */
export async function getVotedPollIds(me: { id: string; family_id: string | null }): Promise<Set<string>> {
  const supabase = await createClient();
  const [{ data }, { data: familyPolls }] = await Promise.all([
    supabase.from("poll_votes").select("poll_id").eq("adult_id", me.id),
    me.family_id ? supabase.from("polls").select("id").eq("one_per_family", true).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const voted = new Set((data ?? []).map((v) => v.poll_id as string));
  const pending = ((familyPolls ?? []) as { id: string }[]).map((p) => p.id).filter((id) => !voted.has(id));
  if (me.family_id && pending.length && adminConfigured()) {
    const { data: fam } = await createAdminClient()
      .from("poll_votes")
      .select("poll_id, adult:adults!inner(family_id)")
      .in("poll_id", pending)
      .eq("adult.family_id", me.family_id);
    for (const v of (fam ?? []) as { poll_id: string }[]) voted.add(v.poll_id);
  }
  return voted;
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
