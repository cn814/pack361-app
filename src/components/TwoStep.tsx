"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, QrCode, Smartphone } from "lucide-react";
import ActionForm, { useSubmitKeepingValues } from "@/components/ActionForm";
import { finishTwoStepSetup, startTwoStepSetup, verifyTwoStep, type SetupStart } from "@/app/two-step/actions";

function CodeInput({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <label className="block text-left">
      <span className="mb-1 block text-xs font-semibold text-navy">6-digit code from the app</span>
      <span className="relative block">
        <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus={autoFocus}
          placeholder="123456"
          className="input pl-9 font-mono text-lg tracking-[0.3em]"
        />
      </span>
    </label>
  );
}

/** Sign-in: enter the code from the authenticator app. */
export function TwoStepVerify() {
  const [state, action, pending] = useActionState(verifyTwoStep, {});
  const onSubmit = useSubmitKeepingValues(action);
  return (
    <form action={action} onSubmit={onSubmit} className="space-y-3">
      <CodeInput autoFocus />
      {state.error && !pending && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

/**
 * Add an authenticator app: show the key as a QR code (scan with another device) and as text
 * or a link (when the app is on this same phone), then confirm with the first code.
 * next="home" goes to the app once confirmed (first setup at sign-in).
 */
export function TwoStepSetup({ next, startLabel = "Set up two-step sign-in" }: { next?: "home"; startLabel?: string }) {
  const [setup, setSetup] = useState<SetupStart | null>(null);
  const [starting, start] = useTransition();
  const begin = () => start(async () => setSetup(await startTwoStepSetup()));

  if (!setup || "error" in setup) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={begin} className="btn-primary w-full" disabled={starting}>
          <QrCode className="h-4 w-4" aria-hidden /> {starting ? "Getting your code…" : startLabel}
        </button>
        {setup && "error" in setup && <p className="text-sm font-semibold text-danger">{setup.error}</p>}
      </div>
    );
  }

  const grouped = setup.secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <div className="space-y-4 text-left">
      <ol className="space-y-4 text-sm text-ink">
        <li className="space-y-2">
          <p>
            <b>1. Add Pack 361 to your authenticator app.</b> On a computer, scan this with your phone&apos;s authenticator app (tap
            <b> +</b> or <b>Add</b>, then <b>Scan a QR code</b>).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code to add Pack 361 to an authenticator app" className="mx-auto h-48 w-48 rounded-xl bg-white p-2 ring-1 ring-line" />
          <p className="text-xs text-muted">
            <Smartphone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Using the app on this phone?{" "}
            <a href={setup.uri} className="font-bold text-pine underline">
              Open it in your authenticator app
            </a>
            , or choose &ldquo;Enter a setup key&rdquo; in the app and type this key (time-based):
          </p>
          <p className="select-all break-all rounded-lg bg-surface-low px-3 py-2 text-center font-mono text-sm tracking-wider text-navy">{grouped}</p>
        </li>
        <li>
          <p className="mb-2">
            <b>2. Enter the code</b> the app now shows for Pack 361.
          </p>
          <ActionForm action={finishTwoStepSetup} submit="Finish setup" busy="Checking…">
            <input type="hidden" name="factorId" value={setup.factorId} />
            {next && <input type="hidden" name="next" value={next} />}
            <CodeInput />
          </ActionForm>
        </li>
      </ol>
    </div>
  );
}
