import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { getMe } from "@/lib/data";

export const metadata: Metadata = { title: "Coming soon" };

/** Someone on the roster signed in while the app is still pilot only (Pack admin → Pilot only). */
export default async function NotYet() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.adult) redirect("/not-on-roster");
  if (!me.held) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <section className="card space-y-3 text-center">
        <Hourglass className="mx-auto h-10 w-10 text-gold-700" aria-hidden />
        <h1 className="text-xl font-extrabold text-pine-950">The Pack 361 app is coming shortly</h1>
        <p className="text-sm text-muted">
          It hasn&apos;t been approved for families yet. The pack committee is reviewing it now, and we&apos;ll email you as soon
          as it&apos;s open.
        </p>
        <p className="text-sm text-muted">
          Until then, nothing changes: pack emails, sign-ups and payments work the way they always have.
        </p>
        <p className="text-xs text-muted">
          Questions? Email{" "}
          <a className="font-bold text-pine underline" href="mailto:app@pack361.org">
            app@pack361.org
          </a>
          .
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
      </section>
    </main>
  );
}
