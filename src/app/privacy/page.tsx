import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getMe } from "@/lib/data";
import { DATA_POLICY_MD } from "@/lib/policies";

export const metadata: Metadata = { title: "Data policy" };

/** The pack's data policy: what the app keeps, who sees it, how long. Anyone can read it. */
export default async function PrivacyPage() {
  const me = await getMe();
  const member = me?.adult && !me.held;
  return (
    <PolicyPage
      title="Pack 361 app: data policy"
      badge="Data policy"
      body={DATA_POLICY_MD}
      back={member ? (me.termsDue ? { href: "/terms", label: "Terms of use" } : { href: "/", label: "Pack 361 app" }) : { href: "/login", label: "Sign in" }}
    />
  );
}
