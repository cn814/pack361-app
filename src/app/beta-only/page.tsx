import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getMe } from "@/lib/data";
import { getTesters } from "@/lib/beta";
import { isBeta, LIVE_URL } from "@/lib/version";

export const metadata: Metadata = { title: "Test site" };

/** Someone who isn't a tester opened the beta site. */
export default async function BetaOnly() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!isBeta() || (me.adult && (await getTesters()).ids.has(me.adult.id))) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <section className="card space-y-3 text-center">
        <FlaskConical className="mx-auto h-10 w-10 text-gold-700" aria-hidden />
        <h1 className="text-xl font-extrabold text-pine-950">This is the pack app&apos;s test site</h1>
        <p className="text-sm text-muted">
          It&apos;s where leaders try new features before everyone gets them. The Pack 361 app you&apos;re looking for is at{" "}
          <b className="text-navy">app.pack361.org</b>.
        </p>
        <a href={LIVE_URL} className="btn-primary w-full">
          Go to the Pack 361 app
        </a>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost w-full">Sign out of the test site</button>
        </form>
      </section>
    </main>
  );
}
