"use client";

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { csvTable, type Cell } from "@/lib/training-import";
import { diffRoster, parseRosterExport, type AppDen, type AppFamily, type AppScout, type NewScout, type ParsedRoster } from "@/lib/roster-check";
import { rosterAddScout, rosterMoveScouts, rosterSaveMemberIds, rosterSetActive } from "../../actions";

/** Read the file in the browser. Nothing in it is uploaded. */
async function readTable(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown as Cell[][];
  }
  if (name.endsWith(".xls")) throw new Error("This is an old Excel file. Open it and save it as .xlsx or CSV, then try again.");
  return csvTable(await file.text());
}

const fullName = (s: { first_name: string; last_name: string }) => `${s.first_name} ${s.last_name}`;

function Section({ title, count, hint, children, action }: { title: string; count: number; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  if (!count) return null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="section-title">
            {title} ({count})
          </h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DenSelect({ dens, name, defaultValue }: { dens: AppDen[]; name: string; defaultValue: string }) {
  return (
    <select className="input py-2 text-sm" name={name} defaultValue={defaultValue} aria-label="Den">
      <option value="">Den (pick later)</option>
      {dens
        .filter((d) => d.is_active || d.id === defaultValue)
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
    </select>
  );
}

function NewScoutCard({ n, dens, families }: { n: NewScout; dens: AppDen[]; families: AppFamily[] }) {
  const [family, setFamily] = useState(n.family?.id ?? "");
  const r = n.row;
  return (
    <article className="card space-y-2">
      <header>
        <p className="font-extrabold text-pine-950">
          {r.first} {r.last}
          {r.nickname && r.nickname !== r.first && <span className="font-semibold text-muted"> “{r.nickname}”</span>}
        </p>
        <p className="text-xs text-muted">
          {[r.denText || "No den in Scoutbook", r.memberId ? `#${r.memberId}` : "No member ID"].join(" · ")}
        </p>
      </header>
      <ActionForm action={rosterAddScout} submit="Add to the app" busy="Adding…" className="space-y-2">
        <input type="hidden" name="first_name" value={r.first} />
        {r.initialOnly ? (
          <Field label="Last name" hint={`This report only gives the initial "${r.last}". Type the full last name.`}>
            <input className="input py-2 text-sm" name="last_name" required maxLength={60} aria-label="Last name" />
          </Field>
        ) : (
          <input type="hidden" name="last_name" value={r.last} />
        )}
        <input type="hidden" name="bsa_member_id" value={r.memberId ?? ""} />
        <DenSelect dens={dens} name="den_id" defaultValue={n.den?.id ?? ""} />
        <Field label="Family" hint={family && family === n.family?.id ? n.familyWhy : undefined}>
          <select className="input py-2 text-sm" name="family_id" value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="">New family</option>
            {families
              .filter((f) => f.is_active || f.id === family)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family_name}
                </option>
              ))}
          </select>
        </Field>
        {!family && (
          <div className="space-y-2 rounded-xl bg-surface-low p-2">
            <input className="input py-2 text-sm" name="family_name" defaultValue={r.initialOnly ? "" : r.last} placeholder="Family name" aria-label="Family name" maxLength={80} />
            <p className="text-[11px] font-bold text-navy">Parent who&apos;ll sign in (optional; you can add them later)</p>
            <div className="grid grid-cols-2 gap-1.5">
              <input className="input py-2 text-sm" name="parent_first" defaultValue={r.parentFirst} placeholder="First name" aria-label="Parent first name" maxLength={60} />
              <input className="input py-2 text-sm" name="parent_last" defaultValue={r.parentLast || (r.initialOnly ? "" : r.last)} placeholder="Last name" aria-label="Parent last name" maxLength={60} />
            </div>
            <input className="input py-2 text-sm" type="email" name="parent_email" defaultValue={r.parentEmail} placeholder="Their email" aria-label="Parent email" maxLength={200} />
          </div>
        )}
      </ActionForm>
    </article>
  );
}

export default function RosterCheck({ scouts, dens, families }: { scouts: AppScout[]; dens: AppDen[]; families: AppFamily[] }) {
  const [parsed, setParsed] = useState<ParsedRoster | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  // Recomputed when the roster changes after each fix, so fixed items drop off the lists.
  const diff = useMemo(() => (parsed ? diffRoster(parsed.rows, scouts, dens, families) : null), [parsed, scouts, dens, families]);
  const denName = (d: AppDen | null) => d?.name ?? "No den";

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError("");
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const p = parseRosterExport(await readTable(file));
      if (p.error) setFileError(p.error);
      else if (!p.rows.length) setFileError("No scouts were found in that file. Export the youth roster with names and dens.");
      else setParsed(p);
    } catch (err) {
      setFileError(err instanceof Error && err.message.startsWith("This is") ? err.message : "Couldn't read that file. Upload the CSV or .xlsx export.");
    }
  }

  const nothing =
    diff &&
    !diff.newScouts.length &&
    !diff.moves.length &&
    !diff.memberIds.length &&
    !diff.inactive.length &&
    !diff.missing.length &&
    !diff.unknownDens.length &&
    !diff.ambiguous.length;

  return (
    <div className="page-wide space-y-5">
      <label className="card block space-y-1 lg:max-w-3xl">
        <span className="block text-xs font-bold text-navy">Scoutbook roster export (.csv or .xlsx)</span>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:font-semibold file:text-white"
        />
        {fileError && <span className="block text-sm font-semibold text-danger">{fileError}</span>}
      </label>

      {parsed && diff && (
        <>
          <p className="text-sm text-muted lg:max-w-3xl">
            Read {parsed.rows.length} scouts from {fileName}
            {parsed.skipped ? ` (left out ${parsed.skipped} adults and den chiefs)` : ""}. Columns used: {parsed.columns.join(", ")}.{" "}
            {diff.matched} match the app.
          </p>
          {nothing && (
            <p className="card flex items-center gap-2 text-sm font-semibold text-pine lg:max-w-3xl">
              <CircleCheck className="h-5 w-5" aria-hidden /> The app matches Scoutbook.
            </p>
          )}

          <Section title="New in Scoutbook" count={diff.newScouts.length} hint="Registered in Scoutbook but not in the app. Check the family before you add each one.">
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {diff.newScouts.map((n) => (
                <NewScoutCard key={`${n.row.line}`} n={n} dens={dens} families={families} />
              ))}
            </div>
          </Section>

          <Section
            title="In a different den"
            count={diff.moves.length}
            hint="Scoutbook has these scouts in another den, usually after moving up in the summer."
            action={
              diff.moves.length > 1 && (
                <ActionForm action={rosterMoveScouts} submit={`Move all ${diff.moves.length}`} busy="Moving…" buttonClass="btn-primary px-4 py-2" className="space-y-1">
                  {diff.moves.map((m) => (
                    <span key={m.scout.id}>
                      <input type="hidden" name="scout_id" value={m.scout.id} />
                      <input type="hidden" name="den_id" value={m.to.id} />
                    </span>
                  ))}
                </ActionForm>
              )
            }
          >
            <ul className="card divide-y divide-line py-1 lg:max-w-3xl">
              {diff.moves.map((m) => (
                <li key={m.scout.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <b className="text-ink">{fullName(m.scout)}</b>{" "}
                    <span className="text-muted">
                      {denName(m.from)} → <b className="text-pine">{m.to.name}</b>
                    </span>
                  </span>
                  <ActionForm action={rosterMoveScouts} submit="Move" busy="Moving…" buttonClass="btn-ghost px-3 py-1.5" className="flex items-center gap-2">
                    <input type="hidden" name="scout_id" value={m.scout.id} />
                    <input type="hidden" name="den_id" value={m.to.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Member IDs to save"
            count={diff.memberIds.length}
            hint="Matched by name. Saving the member ID lets advancement imports find these scouts."
            action={
              <ActionForm action={rosterSaveMemberIds} submit={diff.memberIds.length > 1 ? `Save all ${diff.memberIds.length}` : "Save"} busy="Saving…" buttonClass="btn-primary px-4 py-2" className="space-y-1">
                {diff.memberIds.map((m) => (
                  <span key={m.scout.id}>
                    <input type="hidden" name="scout_id" value={m.scout.id} />
                    <input type="hidden" name="member_id" value={m.memberId} />
                  </span>
                ))}
              </ActionForm>
            }
          >
            <ul className="card divide-y divide-line py-1 text-sm lg:max-w-3xl">
              {diff.memberIds.map((m) => (
                <li key={m.scout.id} className="py-2">
                  <b className="text-ink">{fullName(m.scout)}</b> <span className="text-muted">#{m.memberId}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Registered again" count={diff.inactive.length} hint="Turned off in the app, but in this Scoutbook roster.">
            <ul className="card divide-y divide-line py-1 lg:max-w-3xl">
              {diff.inactive.map(({ scout }) => (
                <li key={scout.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <b className="text-ink">{fullName(scout)}</b> <span className="text-muted">· {scout.family_name} family</span>
                  </span>
                  <ActionForm action={rosterSetActive} submit="Turn back on" busy="Saving…" buttonClass="btn-ghost px-3 py-1.5" className="flex items-center gap-2">
                    <input type="hidden" name="scout_id" value={scout.id} />
                    <input type="hidden" name="active" value="true" />
                  </ActionForm>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Turning a scout back on doesn&apos;t turn on their family&apos;s logins: do that on the family&apos;s page.</p>
          </Section>

          <Section
            title="Not in this export"
            count={diff.missing.length}
            hint={
              <>
                In the app but not in the file. If the file is the whole pack&apos;s youth roster, they may have left or not
                re-registered. Ask their den leader before turning them off; nothing is deleted.
              </>
            }
          >
            <ul className="card divide-y divide-line py-1 lg:max-w-3xl">
              {diff.missing.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <Link href={`/admin/families/${s.family_id}`} className="font-bold text-ink underline-offset-2 hover:underline">
                      {fullName(s)}
                    </Link>{" "}
                    <span className="text-muted">
                      · {denName(dens.find((d) => d.id === s.den_id) ?? null)}
                      {s.bsa_member_id ? ` · #${s.bsa_member_id}` : ""}
                    </span>
                  </span>
                  <ActionForm
                    action={rosterSetActive}
                    submit="Turn off"
                    busy="Saving…"
                    buttonClass="btn-ghost px-3 py-1.5"
                    className="flex items-center gap-2"
                    confirm={`Turn off ${fullName(s)}? They'll drop off den lists. Their family's logins stay on.`}
                  >
                    <input type="hidden" name="scout_id" value={s.id} />
                    <input type="hidden" name="active" value="false" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Den not in the app"
            count={diff.unknownDens.length}
            hint={
              <>
                Scoutbook has a den the app doesn&apos;t. Add it under{" "}
                <Link href="/admin/dens" className="font-semibold text-pine underline">
                  Dens and den leaders
                </Link>
                , then choose the file again.
              </>
            }
          >
            <ul className="card divide-y divide-line py-1 text-sm lg:max-w-3xl">
              {diff.unknownDens.map(({ row, scout }) => (
                <li key={row.line} className="py-2">
                  <b className="text-ink">
                    {row.first} {row.last}
                  </b>{" "}
                  <span className="text-muted">
                    · {row.denText || "no den"}
                    {scout ? "" : " · new"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Names spelled differently" count={diff.nameDiffs.length} hint="Same scout (same member ID), different spelling. Fix it on the family's page if the app is wrong.">
            <ul className="card divide-y divide-line py-1 text-sm lg:max-w-3xl">
              {diff.nameDiffs.map(({ scout, row }) => (
                <li key={scout.id} className="py-2">
                  <Link href={`/admin/families/${scout.family_id}`} className="font-bold text-ink underline-offset-2 hover:underline">
                    {fullName(scout)}
                  </Link>{" "}
                  <span className="text-muted">
                    · Scoutbook: {row.first} {row.last}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Couldn't tell who" count={diff.ambiguous.length} hint="These match more than one scout in the app (same name, or a member ID used twice). Check them by hand.">
            <ul className="card divide-y divide-line py-1 text-sm lg:max-w-3xl">
              {diff.ambiguous.map((row) => (
                <li key={row.line} className="py-2">
                  <b className="text-ink">
                    {row.first} {row.last}
                  </b>{" "}
                  <span className="text-muted">{row.memberId ? `#${row.memberId}` : ""}</span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
