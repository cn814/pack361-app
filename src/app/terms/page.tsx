import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import PolicyPage from "@/components/PolicyPage";
import { getMe } from "@/lib/data";
import { TERMS_MD } from "@/lib/policies";
import { agreeToTerms } from "./actions";

export const metadata: Metadata = { title: "Terms of use" };

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/**
 * The pack's terms of use. Anyone can read them; a signed-in adult who hasn't agreed to the
 * current version is sent here first (requireMember) and agrees at the bottom.
 */
export default async function TermsPage({ searchParams }: PageProps<"/terms">) {
  const sp = await searchParams;
  const me = await getMe();
  const member = me?.adult && !me.held ? me : null;
  return (
    <PolicyPage
      title="Pack 361 app: terms of use"
      badge="Terms of use"
      body={TERMS_MD}
      back={member ? { href: "/", label: "Pack 361 app" } : { href: "/login", label: "Sign in" }}
    >
      {member?.termsDue ? (
        <form action={agreeToTerms} className="card space-y-3">
          <h2 className="font-extrabold text-pine-950">Before you start</h2>
          <p className="text-sm text-muted">
            Please read these terms and the{" "}
            <Link className="font-semibold text-pine underline" href="/privacy">
              data policy
            </Link>
            . You&apos;ll be asked again only if either one changes.
          </p>
          {sp.tick && <p className="rounded-xl bg-gold-50 p-2 text-sm text-gold-800">Tick the box to agree.</p>}
          {sp.failed && (
            <p className="rounded-xl bg-gold-50 p-2 text-sm text-gold-800">
              That didn&apos;t save. Try again, or email app@pack361.org.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 accent-pine" />
            I&apos;ve read and agree to the terms of use and the data policy.
          </label>
          <button className="btn-primary w-full">I agree</button>
        </form>
      ) : member?.termsAcceptedAt ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-pine" aria-hidden /> You agreed on {longDate(member.termsAcceptedAt)}.
        </p>
      ) : null}
    </PolicyPage>
  );
}
