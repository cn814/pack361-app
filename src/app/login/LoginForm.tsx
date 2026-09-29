"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { sendLoginEmail, verifyLoginCode, type LoginState } from "./actions";

const initial: LoginState = { step: "email", email: "" };

/**
 * codeEnabled: whether the sign-in email includes a one-time code as well as the link.
 * Supabase's built-in email sender only sends the link; turn this on (LOGIN_CODE_ENABLED=true)
 * once custom SMTP is set up and the email template includes {{ .Token }}.
 */
export default function LoginForm({ codeEnabled }: { codeEnabled: boolean }) {
  const [sent, sendAction, sending] = useActionState(sendLoginEmail, initial);
  const [verify, verifyAction, verifying] = useActionState(verifyLoginCode, initial);

  const onCodeStep = sent.step === "code";
  const email = sent.email;

  if (!onCodeStep) {
    return (
      <form action={sendAction} className="space-y-3">
        <label className="block text-left">
          <span className="mb-1 block text-xs font-semibold text-navy">Parent / guardian email</span>
          <span className="relative block">
            <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden />
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              defaultValue={sent.email}
              placeholder="you@example.com"
              className="input pl-9"
            />
          </span>
          <span className="mt-1 block text-[11px] text-muted">Use the email the pack has on file.</span>
        </label>
        {sent.error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">{sent.error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={sending}>
          {sending ? "Sending…" : "Email me a sign-in link"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>
    );
  }

  const resend = (
    <form action={sendAction}>
      <input type="hidden" name="email" value={email} />
      <button type="submit" className="w-full text-center text-xs font-bold text-pine underline" disabled={sending}>
        {sending ? "Sending…" : "Didn't get it? Send a new link"}
      </button>
    </form>
  );

  if (!codeEnabled) {
    return (
      <div className="space-y-3 text-left">
        <p className="rounded-xl bg-mint px-3 py-2.5 text-sm text-pine">
          We sent a sign-in link to <strong>{email}</strong>. Open that email on this device and tap the link to sign in.
        </p>
        <p className="text-center text-xs text-muted">
          The link expires in an hour. Check your spam folder if it hasn&apos;t arrived in a couple of minutes.
        </p>
        {resend}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-left">
      <p className="rounded-xl bg-mint px-3 py-2.5 text-sm text-pine">
        We sent a sign-in email to <strong>{email}</strong>. Tap the link in it, or type the code below.
      </p>
      <form action={verifyAction} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-navy">Code from the email</span>
          <span className="relative block">
            <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden />
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={10}
              required
              placeholder="123456"
              className="input pl-9 tracking-[0.3em]"
            />
          </span>
        </label>
        {verify.error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">{verify.error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        Using the app from your home screen? Type the code here instead of tapping the link, so you stay signed in inside
        the app.
      </p>
      {resend}
    </div>
  );
}
