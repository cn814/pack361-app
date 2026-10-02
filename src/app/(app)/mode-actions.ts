"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { MODE_COOKIE } from "@/lib/mode";

/** The Family / Leader switch. */
export async function setMode(form: FormData) {
  const mode = form.get("mode") === "family" ? "family" : "leader";
  (await cookies()).set(MODE_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
