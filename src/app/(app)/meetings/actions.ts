"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** A family says whether their scout is coming to a den meeting. */
export async function setDenMeetingRsvp(meetingId: string, scoutId: string, going: boolean): Promise<{ error?: string }> {
  await requireMember();
  if (!UUID.test(meetingId) || !UUID.test(scoutId) || typeof going !== "boolean") return { error: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_den_meeting_rsvp", { p_meeting_id: meetingId, p_scout_id: scoutId, p_going: going });
  if (error) return { error: error.message.includes("already happened") ? "This meeting already happened." : "Couldn't save. Try again." };
  revalidatePath(`/meetings/${meetingId}`);
  return {};
}
