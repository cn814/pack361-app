import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { displayName, getMe } from "@/lib/data";
import { TwoStepSetup, TwoStepVerify } from "@/components/TwoStep";
import BetaBanner from "@/components/BetaBanner";

export const metadata: Metadata = { title: "Two-step sign-in" };

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="w-full text-center text-xs font-bold text-muted underline">Sign out</button>
    </form>
  );
}

const help = (
  <a className="font-bold text-pine underline" href="mailto:app@pack361.org">
    app@pack361.org
  </a>
);

export default async function TwoStepPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.adult) redirect("/not-on-roster");
  if (me.twoStep === "ok") redirect("/");
  const name = displayName(me.adult);

  return (
    <>
      <BetaBanner />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-4 py-8">
        <section className="card space-y-4 overflow-hidden p-0">
          <div className="h-1.5 bg-brand" />
          <div className="space-y-4 px-5 pb-5 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-pine" aria-hidden />
            {me.twoStep === "verify" ? (
              <>
                <div className="space-y-1">
                  <h1 className="text-xl font-extrabold text-pine-950">One more step, {name}</h1>
                  <p className="text-sm text-muted">
                    Open your authenticator app and enter the code it shows for <b className="text-navy">Pack 361</b>.
                  </p>
                </div>
                <TwoStepVerify />
                <p className="text-xs text-muted">
                  For leaders&apos; accounts the app asks once a month on each device, and after you sign out. Lost your phone or
                  changed phones? Email {help}: an admin can reset it so you can set it up again.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h1 className="text-xl font-extrabold text-pine-950">Protect your leader account</h1>
                  <p className="text-sm text-muted">
                    Leaders can see every family&apos;s details and every scout, so the app asks for a
                    second step: a code from an authenticator app on your phone, as well as the email code.
                  </p>
                </div>
                <div className="rounded-xl bg-surface-low px-3 py-2.5 text-left text-xs text-ink">
                  <b>Need an app?</b> Any authenticator app works, all free: Google Authenticator, Microsoft Authenticator, or the
                  one built into your password manager (1Password, iPhone Passwords). Install one, then come back here.
                </div>
                <TwoStepSetup next="home" />
                <p className="text-xs text-muted">
                  It takes about two minutes, and after that you&apos;ll enter a code once a month on each device. Questions? Email{" "}
                  {help}.
                </p>
              </>
            )}
            <SignOut />
          </div>
        </section>
      </main>
    </>
  );
}
