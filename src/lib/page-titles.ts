import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

// Browser-tab and share titles from the record (generateMetadata). Light reads; the database
// decides what the signed-in person may see, so a record they can't see just keeps the page's
// fixed title.

const UUID = /^[0-9a-f-]{36}$/i;

/** An event's or campout's title, or null. */
export const eventTitle = cache(async (id: string): Promise<string | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("title").eq("id", id).maybeSingle();
  return (data?.title as string | undefined) ?? null;
});

/** A scout's first name, or null. */
export const scoutFirstName = cache(async (id: string): Promise<string | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("scouts").select("first_name").eq("id", id).maybeSingle();
  return (data?.first_name as string | undefined) ?? null;
});
