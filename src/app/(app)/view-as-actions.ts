"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/data";
import { VIEW_AS_COOKIE, viewableRoles } from "@/lib/view-as";
import type { AppRole } from "@/lib/types";

/** Start or stop seeing the app as another role. Display only; permissions don't change. */
export async function setViewAs(form: FormData) {
  const me = await requireMember();
  const real = me.real_role ?? me.role;
  const role = String(form.get("role") ?? "") as AppRole;
  const jar = await cookies();
  if (role && viewableRoles(real).includes(role)) {
    jar.set(VIEW_AS_COOKIE, role, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 8 });
    redirect("/");
  }
  jar.delete(VIEW_AS_COOKIE);
  redirect(String(form.get("back") ?? "") === "leaders" ? "/leaders" : "/");
}
