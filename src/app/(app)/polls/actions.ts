"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ActionResult } from "@/components/ActionForm";
import { isAdmin } from "@/lib/advancement-data";
import { denAudience } from "@/lib/audience";
import { isLeader, requireMember } from "@/lib/data";
import { sendPushTo, sendPushToAll } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { easternToIso } from "@/lib/calendar";

const UUID = /^[0-9a-f-]{36}$/i;

/** Leaders: start a poll for the pack or one den. */
export async function createPoll(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can start polls." };
  const question = String(form.get("question") ?? "").trim().slice(0, 200);
  const details = String(form.get("details") ?? "").trim().slice(0, 1000) || null;
  const options = form
    .getAll("option")
    .map((o) => String(o).trim().slice(0, 120))
    .filter(Boolean);
  const denId = String(form.get("den_id") ?? "");
  const closes = String(form.get("closes_on") ?? "").trim();
  if (!question) return { error: "Ask a question." };
  if (options.length < 2) return { error: "Give at least two answers to pick from." };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: "Each answer should be different." };
  if (closes && !/^\d{4}-\d{2}-\d{2}$/.test(closes)) return { error: "Pick a closing date." };
  const den = UUID.test(denId) ? denId : null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("polls")
    .insert({
      question,
      details,
      options: options.slice(0, 10),
      allow_multiple: form.get("allow_multiple") === "on",
      one_per_family: form.get("one_per_family") === "on",
      den_id: den,
      results_visible: form.get("results_visible") === "leaders" ? "leaders" : "voters",
      // Open through the end of the closing day, Eastern time.
      closes_at: closes ? easternToIso(closes, "23:59") : null,
      created_by: me.id,
    })
    .select("id, den:dens(name)")
    .single();
  if (error || !data) return { error: den ? "Couldn't start that poll. You can only poll dens you lead." : "Couldn't start that poll." };
  if (form.get("notify") === "on") {
    const denName = (data.den as unknown as { name: string } | null)?.name;
    const payload = { title: denName ? `${denName} poll` : "Pack 361 poll", body: question.slice(0, 160), url: `/polls/${data.id}`, tag: `poll-${data.id}` };
    after(async () => {
      if (den) await sendPushTo((await denAudience(den)).map((p) => p.id).filter((id) => id !== me.id), payload);
      else await sendPushToAll(payload, me.id);
    });
  }
  revalidatePath("/", "layout");
  redirect(`/polls/${data.id}`);
}

/** Vote, or change your vote. */
export async function vote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("poll_id") ?? "");
  const choices = form
    .getAll("choice")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  if (!UUID.test(id)) return { error: "Poll not found." };
  if (!choices.length) return { error: "Pick an answer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_vote", { p_poll_id: id, p_choices: choices });
  if (error) return { error: error.message.includes("closed") ? "This poll is closed." : "Couldn't save your answer." };
  revalidatePath(`/polls/${id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Thanks, your answer is in. You can change it until the poll closes." };
}

/** The poll's creator or an admin closes (or reopens) it. */
export async function setPollClosed(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("poll_id") ?? "");
  if (!UUID.test(id) || !isLeader(me)) return;
  const supabase = await createClient();
  await supabase
    .from("polls")
    .update({ closed_at: form.get("close") === "1" ? new Date().toISOString() : null, ...(form.get("close") === "1" ? {} : { closes_at: null }) })
    .eq("id", id);
  revalidatePath(`/polls/${id}`);
  revalidatePath("/", "layout");
}

export async function deletePoll(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("poll_id") ?? "");
  if (!UUID.test(id) || !(isLeader(me) || isAdmin(me))) return;
  const supabase = await createClient();
  await supabase.from("polls").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/polls");
}
