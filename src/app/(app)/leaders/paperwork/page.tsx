import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { isLeader, requireMember } from "@/lib/data";
import { markDues, markFormsOnFile } from "@/app/(app)/paperwork-actions";
import { FORM_STATE_LABEL, FORM_STATE_STYLE, formState, getPaperworkOverview, type FormState, type HealthForm } from "@/lib/paperwork";
import { fmtShortDate } from "@/lib/advancement";

export const metadata: Metadata = { title: "Paperwork" };

const SHOW = {
  waiting: "Turned in",
  scouts: "Scouts missing",
  adults: "Adults missing",
  all: "Everyone",
} as const;
type Show = keyof typeof SHOW;

const RANKS = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
const rankOrder = (r: string | undefined) => (r ? RANKS.indexOf(r) : 99);

interface Row {
  who: string;
  name: string;
  group: string;
  form?: HealthForm;
  state: FormState;
}

export default async function PaperworkPage({ searchParams }: PageProps<"/leaders/paperwork">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/leaders");
  const sp = await searchParams;
  const tab = sp.tab === "dues" ? "dues" : "forms";
  const data = await getPaperworkOverview();
  const famName = new Map(data.families.map((f) => [f.id, f.family_name]));
  const activeFamilies = new Set(data.scouts.map((s) => s.family_id).filter(Boolean) as string[]);

  const scoutRows: Row[] = data.scouts
    .sort((a, b) => rankOrder(a.den?.rank) - rankOrder(b.den?.rank) || (a.den?.number ?? 0) - (b.den?.number ?? 0) || a.first_name.localeCompare(b.first_name))
    .map((s) => {
      const form = data.forms.find((f) => f.scout_id === s.id);
      return { who: `s:${s.id}`, name: `${s.first_name} ${s.last_name}`, group: s.den?.name ?? "No den", form, state: formState(form) };
    });
  const adultRows: Row[] = data.adults
    .filter((a) => a.family_id && activeFamilies.has(a.family_id))
    .sort((a, b) => (famName.get(a.family_id!) ?? "").localeCompare(famName.get(b.family_id!) ?? "") || a.first_name.localeCompare(b.first_name))
    .map((a) => {
      const form = data.forms.find((f) => f.adult_id === a.id);
      return {
        who: `a:${a.id}`,
        name: `${a.preferred_name || a.first_name} ${a.last_name}`,
        group: `${famName.get(a.family_id!) ?? "Family"} family (adults)`,
        form,
        state: formState(form),
      };
    });
  const waiting = [...scoutRows, ...adultRows].filter((r) => r.state === "submitted");
  const show: Show = typeof sp.show === "string" && sp.show in SHOW ? (sp.show as Show) : waiting.length ? "waiting" : "scouts";
  const rows =
    show === "waiting"
      ? waiting
      : show === "scouts"
        ? scoutRows.filter((r) => r.state !== "current")
        : show === "adults"
          ? adultRows.filter((r) => r.state !== "current")
          : [...scoutRows, ...adultRows];
  const groups = [...new Set(rows.map((r) => r.group))];
  const scoutsOk = scoutRows.filter((r) => r.state === "current" || r.state === "expiring").length;

  const duesFamilies = data.families.filter((f) => activeFamilies.has(f.id));
  const paid = duesFamilies.filter((f) => data.dues.some((d) => d.family_id === f.id && d.status === "paid")).length;

  return (
    <>
      <BackLink href="/leaders" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Paperwork</h1>
      <div className="flex gap-2 text-sm font-semibold" role="tablist">
        {(["forms", "dues"] as const).map((t) => (
          <Link
            key={t}
            href={`/leaders/paperwork?tab=${t}`}
            role="tab"
            aria-selected={tab === t}
            className={`rounded-full px-3 py-1.5 ${tab === t ? "bg-pine text-white" : "border border-line bg-white text-navy"}`}
          >
            {t === "forms" ? "Medical forms" : `Dues ${data.season}`}
          </Link>
        ))}
      </div>

      {tab === "forms" ? (
        <>
          <p className="-mt-1 text-sm text-muted">
            {scoutsOk} of {scoutRows.length} scouts have a current form. {waiting.length} turned in by families and waiting for you to
            confirm you have the paper copy.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {(Object.keys(SHOW) as Show[]).map((k) => (
              <Link
                key={k}
                href={`/leaders/paperwork?tab=forms&show=${k}`}
                className={`rounded-full px-3 py-1 ${show === k ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}
              >
                {SHOW[k]}
                {k === "waiting" && waiting.length ? ` (${waiting.length})` : ""}
              </Link>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="card text-sm text-muted">Nobody here. Nice.</p>
          ) : (
            <ActionForm action={markFormsOnFile} submit="Mark checked forms received" busy="Saving…" className="space-y-3">
              {groups.map((g) => (
                <section key={g} className="card space-y-1">
                  <h2 className="section-title">{g}</h2>
                  <ul className="divide-y divide-line">
                    {rows
                      .filter((r) => r.group === g)
                      .map((r) => (
                        <li key={r.who}>
                          <label className="flex items-center gap-3 py-2">
                            <input type="checkbox" name="who" value={r.who} className="h-5 w-5 shrink-0 accent-pine" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-ink">{r.name}</span>
                              {r.form?.form_date && (
                                <span className="block text-[11px] text-muted">
                                  Form dated {fmtShortDate(r.form.form_date)}
                                  {r.form.expires_on ? ` · good through ${fmtShortDate(r.form.expires_on)}` : ""}
                                </span>
                              )}
                            </span>
                            <span className={`badge shrink-0 normal-case tracking-normal ${FORM_STATE_STYLE[r.state]}`}>{FORM_STATE_LABEL[r.state]}</span>
                          </label>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
              <label className="card block space-y-1">
                <span className="text-xs font-bold text-navy">Date on the forms (optional)</span>
                <input type="date" name="form_date" className="input" />
                <span className="block text-[11px] text-muted">
                  Leave blank to keep the date the family entered (or today). Forms are good for 12 months from this date.
                </span>
              </label>
              <label className="flex items-center gap-2 px-1 text-xs text-muted">
                <input type="checkbox" name="intent" value="clear" className="h-4 w-4 accent-danger" /> Instead, clear the checked
                people&apos;s records (entered by mistake)
              </label>
            </ActionForm>
          )}
          <p className="px-1 text-[11px] text-muted">
            Keep the paper forms with the campout&apos;s first aid kit or the pack&apos;s records. This page only tracks that you have them.
          </p>
        </>
      ) : (
        <>
          <p className="-mt-1 text-sm text-muted">
            {paid} of {duesFamilies.length} families paid for {data.season}. Change the season, amount and how to pay in Pack admin →
            Pack settings.
          </p>
          <ActionForm action={markDues} submit="Mark checked families paid" busy="Saving…" className="space-y-3">
            <ul className="card divide-y divide-line py-1">
              {duesFamilies.map((f) => {
                const d = data.dues.find((x) => x.family_id === f.id);
                return (
                  <li key={f.id}>
                    <label className="flex items-center gap-3 py-2">
                      <input type="checkbox" name="family" value={f.id} className="h-5 w-5 shrink-0 accent-pine" />
                      <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{f.family_name}</span>
                      <span
                        className={`badge shrink-0 normal-case tracking-normal ${
                          d?.status === "paid" ? "bg-mint text-pine" : d ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"
                        }`}
                      >
                        {d?.status === "paid" ? `Paid${d.paid_on ? ` ${fmtShortDate(d.paid_on)}` : ""}` : d ? "Family says paid" : "Not paid"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <label className="flex items-center gap-2 px-1 text-xs text-muted">
              <input type="checkbox" name="intent" value="clear" className="h-4 w-4 accent-danger" /> Instead, clear the checked
              families (entered by mistake)
            </label>
          </ActionForm>
        </>
      )}
    </>
  );
}
