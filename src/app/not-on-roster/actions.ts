"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/data";
import { notifyAdmins } from "@/lib/notify";
import { APP_URL } from "@/lib/email";
import { isGrade, MAX_JOIN_SCOUTS, type JoinScout } from "@/lib/join";

const str = (form: FormData, k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);

/** Someone signed in but not on the roster asks the pack admins to add them. */
export async function askToJoin(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await getMe();
  if (!me) return { error: "Sign in first." };
  if (me.adult) return { error: "You're already on the roster. Reload the page." };

  const first = str(form, "first_name", 60);
  const last = str(form, "last_name", 60);
  if (!first || !last) return { error: "Add your first and last name." };
  const phone = str(form, "phone", 40) || null;
  const relationship = str(form, "relationship", 40) || null;
  const note = str(form, "note", 1000) || null;

  const firsts = form.getAll("scout_first").map((v) => String(v).trim().slice(0, 60));
  const lasts = form.getAll("scout_last").map((v) => String(v).trim().slice(0, 60));
  const grades = form.getAll("scout_grade").map((v) => String(v));
  const scouts: JoinScout[] = [];
  for (let i = 0; i < firsts.length && scouts.length < MAX_JOIN_SCOUTS; i++) {
    if (!firsts[i] && !lasts[i]) continue;
    if (!firsts[i]) return { error: "Add each scout's first name." };
    const g = grades[i] ?? "";
    scouts.push({ first_name: firsts[i], last_name: lasts[i] || last, grade: isGrade(g) ? g : null });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("join_requests").insert({ first_name: first, last_name: last, phone, relationship, note, scouts });
  if (error) {
    if (/join_requests_one_open/.test(error.message)) return { error: "Your request is already waiting for a pack admin." };
    if (/already on the roster/i.test(error.message)) return { error: "You're already on the roster. Reload the page." };
    if (/Too many/i.test(error.message)) return { error: error.message };
    return { error: "Couldn't send that. Try again, or email info@pack361.org." };
  }

  try {
    const who = `${first} ${last}`;
    const kids = scouts.length ? ` with ${scouts.length} scout${scouts.length === 1 ? "" : "s"}` : "";
    await notifyAdmins(
      { title: "Asked to join the app", body: `${who}${kids}`, url: "/admin/join", tag: "join" },
      {
        subject: `${who} asked to join the Pack 361 app`,
        paragraphs: [
          `${who} (${me.email}) signed in to the app and asked to be added to the roster${kids}.`,
          "Check they're a pack family, then approve or decline it in the app under Pack admin, Join requests.",
          `${APP_URL}/admin/join`,
        ],
      },
    );
  } catch {
    // Admins still see it in Pack admin.
  }
  revalidatePath("/not-on-roster");
  return { ok: true, message: "Sent" };
}
