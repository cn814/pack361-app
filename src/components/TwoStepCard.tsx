import { ShieldCheck, Smartphone } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { TwoStepSetup } from "@/components/TwoStep";
import { createClient } from "@/lib/supabase/server";
import { removeTwoStepDevice } from "@/app/two-step/actions";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** My family, for leaders: their authenticator apps, add a backup, remove one. */
export default async function TwoStepCard() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const apps = data?.totp ?? [];
  return (
    <section id="two-step" className="card scroll-mt-20 space-y-3">
      <h2 className="section-title flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 text-pine" aria-hidden /> Two-step sign-in
      </h2>
      <p className="text-sm text-muted">
        As a pack leader you sign in with your email code and a code from your authenticator app. Add a second app (a tablet, or
        your password manager) so losing your phone doesn&apos;t lock you out.
      </p>
      <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
        {apps.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-pine" aria-hidden />
              <span>
                Authenticator app
                <span className="block text-xs text-muted">
                  Added {shortDate(f.created_at)}
                  {f.last_challenged_at ? ` · last used ${shortDate(f.last_challenged_at)}` : ""}
                </span>
              </span>
            </span>
            {apps.length > 1 && (
              <ActionForm
                action={removeTwoStepDevice}
                submit="Remove"
                busy="Removing…"
                className="flex flex-col items-end"
                buttonClass="text-xs font-bold text-danger underline"
                confirm="Remove this authenticator app? Its codes will stop working."
              >
                <input type="hidden" name="factorId" value={f.id} />
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
      <TwoStepSetup startLabel="Add another authenticator app" />
    </section>
  );
}
