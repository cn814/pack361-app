import type { Metadata } from "next";
import { X } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { requireAdmin, ROLE_LABEL } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";
import { REPORTS } from "@/lib/reports";
import { addReportAccess, removeReportAccess } from "./actions";
import type { AppRole } from "@/lib/types";

export const metadata: Metadata = { title: "Report access" };

const DEFAULTS: Record<"roster" | "membership", string> = {
  roster: "The Cubmaster and admins",
  membership: "Key leaders, the Cubmaster and admins",
};

/**
 * Pack admin: who else can open the roster and membership reports (say, the treasurer's helper
 * for membership). Only leaders can be added: the reports need the authenticator code.
 */
export default async function ReportAccessPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: grants }, { data: leaders }] = await Promise.all([
    supabase.from("report_access").select("report, adult_id"),
    supabase
      .from("adults")
      .select("id, first_name, preferred_name, last_name, role, position_title")
      .eq("is_active", true)
      .neq("role", "parent")
      .order("last_name")
      .order("first_name"),
  ]);
  const people = (leaders ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string; role: AppRole; position_title: string | null }[];
  const name = (id: string) => {
    const a = people.find((p) => p.id === id);
    return a ? `${a.preferred_name || a.first_name} ${a.last_name}` : "Someone no longer a leader";
  };
  const list = (grants ?? []) as { report: "roster" | "membership"; adult_id: string }[];

  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Report access</h1>
      <p className="-mt-1 text-sm text-muted">
        Training, medical-form and attendance reports are open to every leader. The roster and membership reports hold more, so they&rsquo;re open to
        fewer people by default; add anyone else who needs one. Only leaders can be added (the reports need the authenticator code).
      </p>
      {(["roster", "membership"] as const).map((r) => {
        const here = list.filter((g) => g.report === r);
        return (
          <section key={r} className="card space-y-3">
            <div>
              <h2 className="section-title">{REPORTS[r].title}</h2>
              <p className="text-xs text-muted">{REPORTS[r].about}</p>
              <p className="pt-1 text-xs text-ink">
                <b>Always:</b> {DEFAULTS[r]}.
              </p>
            </div>
            {here.length > 0 && (
              <ul className="divide-y divide-line">
                {here.map((g) => (
                  <li key={g.adult_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-semibold text-ink">{name(g.adult_id)}</span>
                    <form action={removeReportAccess}>
                      <input type="hidden" name="report" value={r} />
                      <input type="hidden" name="adult_id" value={g.adult_id} />
                      <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">
                        <X className="h-3.5 w-3.5" aria-hidden /> Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addReportAccess} submit="Add" buttonClass="btn-primary w-full py-2">
              <input type="hidden" name="report" value={r} />
              <Field label="Add a leader">
                <select name="adult_id" className="input" required defaultValue="">
                  <option value="" disabled>
                    Choose a leader
                  </option>
                  {people
                    .filter((p) => !here.some((g) => g.adult_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.preferred_name || p.first_name} {p.last_name} · {p.position_title || ROLE_LABEL[p.role]}
                      </option>
                    ))}
                </select>
              </Field>
            </ActionForm>
          </section>
        );
      })}
    </>
  );
}
