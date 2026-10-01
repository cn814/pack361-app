import Link from "next/link";
import { CircleCheck, FileSignature, Printer } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { displayName, isLeader } from "@/lib/data";
import { getFamilySlips, getLeaderSlips, slipOpen, type LeaderSlipRow, type Slip } from "@/lib/permission-slips";
import { recordPaperSlip, removeSlip, signSlips } from "@/app/(app)/events/actions";
import type { Adult, PackEvent } from "@/lib/types";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const dueLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const person = (p: { first_name: string; preferred_name: string | null; last_name: string } | null) => (p ? `${displayName(p)} ${p.last_name}` : "");

function SlipStatus({ slip }: { slip: Slip }) {
  return (
    <span className="text-xs text-pine">
      <CircleCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
      {slip.kind === "paper"
        ? `Paper slip received${slip.recorder ? ` by ${person(slip.recorder)}` : ""}`
        : `Signed by ${slip.signed_name ?? person(slip.signer)}`}{" "}
      · {shortDate(slip.created_at)}
    </span>
  );
}

function LeaderRow({ r, eventId }: { r: LeaderSlipRow; eventId: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0">
        <b className="text-ink">
          {r.scout.first_name} {r.scout.last_name}
        </b>
        <span className="text-xs text-muted"> · {r.scout.den?.name ?? "No den"}</span>
        {r.slip?.contact && <span className="block text-xs text-navy">During the event: {r.slip.contact}</span>}
      </span>
      {r.slip ? (
        <span className="flex items-center gap-2">
          <SlipStatus slip={r.slip} />
          <form action={removeSlip}>
            <input type="hidden" name="id" value={r.slip.id} />
            <input type="hidden" name="event_id" value={eventId} />
            <button className="text-xs font-semibold text-muted underline" aria-label={`Remove ${r.scout.first_name}'s slip`}>
              Remove
            </button>
          </form>
        </span>
      ) : (
        <form action={recordPaperSlip} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gold-800">Not signed</span>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="scout_id" value={r.scout.id} />
          <button className="btn-ghost px-2.5 py-1 text-xs">Paper slip in</button>
        </form>
      )}
    </li>
  );
}

/** The permission slip card on an event: parents sign; leaders see who has. */
export default async function PermissionSlips({ e, me }: { e: PackEvent; me: Adult }) {
  if (!e.slip_required) return null;
  const leader = isLeader(me);
  const [mine, all] = await Promise.all([getFamilySlips(e, me.family_id), leader ? getLeaderSlips(e) : Promise.resolve([])]);
  if (!mine.length && !leader) return null;
  const open = slipOpen(e);
  const unsigned = mine.filter((m) => !m.slip);
  const going = all.filter((r) => r.going);
  const others = all.filter((r) => !r.going);
  const signedGoing = going.filter((r) => r.slip).length;

  return (
    <section id="slip" className="card scroll-mt-20 space-y-3 border-l-4 border-l-gold">
      <header className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
          <FileSignature className="h-5 w-5 text-gold-700" aria-hidden /> Permission slip
        </h2>
        {e.slip_due && <span className="text-xs font-semibold text-gold-800">Due {dueLabel(e.slip_due)}</span>}
      </header>

      {mine.length > 0 && (
        <>
          <p className="whitespace-pre-line rounded-xl bg-surface-low p-3 text-sm text-ink">{e.slip_text}</p>
          {e.slip_document_id && (
            <Link href={`/documents/${e.slip_document_id}`} prefetch={false} className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine underline">
              <Printer className="h-4 w-4" aria-hidden /> Printable form (if you&apos;d rather sign on paper)
            </Link>
          )}
          <ul className="space-y-1.5">
            {mine
              .filter((m) => m.slip)
              .map(({ scout, slip }) => (
                <li key={scout.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <b className="text-ink">{scout.first_name}</b> <SlipStatus slip={slip!} />
                  </span>
                  {slip!.kind === "signed" && open && (
                    <form action={removeSlip}>
                      <input type="hidden" name="id" value={slip!.id} />
                      <input type="hidden" name="event_id" value={e.id} />
                      <button className="text-xs font-semibold text-muted underline">Take back</button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
          {unsigned.length > 0 && open && (
            <ActionForm action={signSlips} submit="Sign" busy="Signing…" className="space-y-2">
              <input type="hidden" name="event_id" value={e.id} />
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                <legend className="mb-1 text-xs font-bold text-navy">Signing for</legend>
                {unsigned.map(({ scout }) => (
                  <label key={scout.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="scout_id" value={scout.id} defaultChecked className="h-4 w-4 accent-pine" />
                    {scout.first_name}
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-navy">Type your full name to sign</span>
                <input className="input" name="signed_name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={`${displayName(me)} ${me.last_name}`} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-navy">Phone to reach you during the event (optional)</span>
                <input className="input" name="contact" type="tel" maxLength={200} defaultValue={me.phone ?? ""} />
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 accent-pine" />
                I&apos;m their parent or guardian, I&apos;ve read the above, and I agree.
              </label>
            </ActionForm>
          )}
          {unsigned.length > 0 && !open && <p className="text-sm text-muted">This event is over.</p>}
        </>
      )}

      {leader && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-bold text-navy">
            Leaders: {signedGoing} of {going.length} scout{going.length === 1 ? "" : "s"} from families going have a slip
          </p>
          {going.length > 0 ? (
            <ul className="divide-y divide-line">
              {going.map((r) => (
                <LeaderRow key={r.scout.id} r={r} eventId={e.id} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No family has said Going yet.</p>
          )}
          {others.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-muted">
                Everyone else the event is for ({others.length}, {others.filter((r) => r.slip).length} with a slip)
              </summary>
              <ul className="divide-y divide-line">
                {others.map((r) => (
                  <LeaderRow key={r.scout.id} r={r} eventId={e.id} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
