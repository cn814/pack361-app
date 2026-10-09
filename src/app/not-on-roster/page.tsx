import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock, UserX } from "lucide-react";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import JoinForm from "@/components/JoinForm";
import type { JoinRequest } from "@/lib/join";
import { askToJoin } from "./actions";

export const metadata: Metadata = { title: "Not on the roster" };

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });

function SignOut({ label }: { label: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn-ghost w-full">{label}</button>
    </form>
  );
}

export default async function NotOnRoster() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.adult) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase
    .from("join_requests")
    .select("id, status, decline_reason, created_at, decided_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = data as Pick<JoinRequest, "id" | "status" | "decline_reason" | "created_at" | "decided_at"> | null;
  const email = <strong className="text-navy">{me.email}</strong>;

  if (last?.status === "pending") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
        <section className="card space-y-3 text-center">
          <Clock className="mx-auto h-10 w-10 text-pine" aria-hidden />
          <h1 className="text-xl font-extrabold text-pine-950">Your request is with the pack</h1>
          <p className="text-sm text-muted">
            You asked to join on {longDate(last.created_at)}. A pack admin will check it and add you, usually within a few days.
            We&apos;ll email {email} when you&apos;re in. Then just open the app again.
          </p>
          <p className="text-xs text-muted">
            Questions? Email <a className="font-bold text-pine underline" href="mailto:app@pack361.org">app@pack361.org</a>.
          </p>
          <SignOut label="Sign out" />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 py-6">
      <section className="card space-y-2 text-center">
        <UserX className="mx-auto h-10 w-10 text-gold-700" aria-hidden />
        <h1 className="text-xl font-extrabold text-pine-950">We don&apos;t have that email on the roster</h1>
        <p className="text-sm text-muted">
          You&apos;re signed in as {email}, but it doesn&apos;t match a Pack 361 parent or leader. If you gave the pack a
          different email, sign out and try that one.
        </p>
        <SignOut label="Sign out and try another email" />
      </section>

      {last?.status === "declined" && (
        <p className="card text-sm text-gold-800">
          A pack admin couldn&apos;t add you from your last request{last.decided_at ? ` (${longDate(last.decided_at)})` : ""}.
          {last.decline_reason && <> Their note: “{last.decline_reason}”</>} You can ask again below, or email{" "}
          <a className="font-bold underline" href="mailto:app@pack361.org">app@pack361.org</a>.
        </p>
      )}

      <section className="card space-y-3">
        <div className="text-center">
          <h2 className="font-extrabold text-pine-950">New to the pack? Ask to join the app</h2>
          <p className="text-sm text-muted">
            A pack admin checks every request and adds you with {email}. Still deciding about Cub Scouts? See{" "}
            <Link className="font-bold text-pine underline" href="/join">
              what the pack does
            </Link>
            .
          </p>
        </div>
        <JoinForm action={askToJoin} />
      </section>
    </main>
  );
}
