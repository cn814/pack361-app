"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { MODE_COOKIE } from "@/lib/mode";

/**
 * The Family / Leader switch. Leader mode is the default for leaders, so choosing Family lasts
 * 12 hours (and until the next sign-in); then the app is back in Leader mode.
 */
export async function setMode(form: FormData) {
  const jar = await cookies();
  if (form.get("mode") !== "family") {
    jar.delete(MODE_COOKIE);
    revalidatePath("/", "layout");
    return;
  }
  jar.set(MODE_COOKIE, "family", {
    path: "/",
    maxAge: 60 * 60 * 12,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
