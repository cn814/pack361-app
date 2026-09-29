import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { getMe } from "@/lib/data";

export const metadata: Metadata = { title: "Not on the roster" };

export default async function NotOnRoster() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.adult) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <section className="card text-center">
        <UserX className="mx-auto mb-2 h-10 w-10 text-gold-700" aria-hidden />
        <h1 className="text-xl font-extrabold text-pine-950">We don&apos;t have that email on the roster</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in as <strong className="text-navy">{me.email}</strong>, but it doesn&apos;t match a Pack 361
          parent or leader. If you registered with a different email, sign out and try that one. Otherwise, email{" "}
          <a className="font-bold text-pine underline" href="mailto:info@pack361.org">info@pack361.org</a> and a leader
          will add you.
        </p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="btn-ghost w-full">Sign out and try another email</button>
        </form>
      </section>
    </main>
  );
}
