import { Car, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { removeCarpool, saveCarpool } from "@/app/(app)/events/carpool-actions";
import { carpoolOn, getCarpoolBoard, type CarpoolPost, type CarpoolTarget } from "@/lib/carpool";
import { contactHref } from "@/lib/carpool-contact";
import { isLeader } from "@/lib/data";
import { eventOver } from "@/lib/format";
import type { Adult, PackEvent } from "@/lib/types";

/** The carpool board on a calendar event that involves driving. Gone once the event is over. */
export default async function EventCarpool({ e, me }: { e: PackEvent; me: Adult }) {
  if (!carpoolOn(e) || e.archived_at || eventOver(e)) return null;
  return <CarpoolSection target={{ kind: "event", id: e.id }} title={e.title} me={me} />;
}

/** The hidden field that tells the carpool actions which event or den meeting this is. */
function TargetField({ target }: { target: CarpoolTarget }) {
  return <input type="hidden" name={target.kind === "event" ? "event_id" : "meeting_id"} value={target.id} />;
}

/**
 * Carpool board: families post "we have seats" or "we need a ride" (one post per family), with
 * where they leave from and how to reach them if they choose to share it. On calendar events and
 * on off-site den meetings planned in the app.
 */
export async function CarpoolSection({ target, title, me }: { target: CarpoolTarget; title: string; me: Adult }) {
  const posts = await getCarpoolBoard(target);
  const leader = isLeader(me);
  const mine = posts.find((p) => p.mine) ?? null;
  const offers = posts.filter((p) => p.kind === "offer");
  const needs = posts.filter((p) => p.kind === "need");
  const seatsOpen = offers.reduce((n, p) => n + p.seats, 0);
  const seatsNeeded = needs.reduce((n, p) => n + p.seats, 0);

  return (
    <section id="carpool" className="card scroll-mt-20 space-y-3">
      <h2 className="section-title flex items-center gap-1.5">
        <Car className="h-4 w-4" aria-hidden /> Carpool
      </h2>
      <p className="text-sm text-ink">
        {posts.length
          ? `${seatsOpen} ${seatsOpen === 1 ? "seat" : "seats"} offered · ${seatsNeeded} ${seatsNeeded === 1 ? "seat" : "seats"} needed.`
          : "Have seats to share, or need a ride? Post it here and families can reach each other."}
      </p>

      {offers.length > 0 && <Board heading="Have seats" posts={offers} target={target} eventTitle={title} leader={leader} />}
      {needs.length > 0 && <Board heading="Need a ride" posts={needs} target={target} eventTitle={title} leader={leader} />}

      {mine ? (
        <details className="rounded-xl bg-surface-low p-3">
          <summary className="cursor-pointer text-sm font-bold text-pine">Change or remove your post</summary>
          <PostForm target={target} post={mine} />
          <ActionForm action={removeCarpool} submit="Remove my post" buttonClass="btn-ghost mt-2 w-full py-2" className="">
            <input type="hidden" name="id" value={mine.id} />
            <TargetField target={target} />
          </ActionForm>
        </details>
      ) : (
        <details className="rounded-xl bg-surface-low p-3">
          <summary className="cursor-pointer text-sm font-bold text-pine">Post seats or ask for a ride</summary>
          <PostForm target={target} post={null} />
        </details>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <b>Youth protection:</b> parents arrange rides for their own scouts, and no adult rides alone with a scout who
          isn&rsquo;t their own child. Whatever you put in Contact is seen by every family who can open this page.
        </span>
      </p>
    </section>
  );
}

function Board({ heading, posts, target, eventTitle, leader }: { heading: string; posts: CarpoolPost[]; target: CarpoolTarget; eventTitle: string; leader: boolean }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{heading}</h3>
      <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
        {posts.map((p) => {
          const link = p.contact ? contactHref(p.contact, eventTitle) : null;
          return (
            <li key={p.id} className="space-y-0.5 px-3 py-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-bold text-ink">
                  {p.name}
                  {p.mine && <span className="ml-1.5 text-xs font-semibold text-pine">(you)</span>}
                </span>
                <span className="text-xs font-bold text-pine">
                  {p.seats} {p.seats === 1 ? "seat" : "seats"}
                  {p.kind === "offer" ? " open" : " needed"}
                </span>
              </p>
              {p.leaving_from && <p className="text-xs text-muted">From {p.leaving_from}</p>}
              {p.note && <p className="text-sm text-ink">{p.note}</p>}
              {p.contact &&
                (link ? (
                  <a href={link.href} className="inline-flex items-center gap-1 text-sm font-bold text-pine underline">
                    {link.kind === "text" ? <MessageSquare className="h-3.5 w-3.5" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                    {link.kind === "text" ? `Text ${p.contact}` : p.contact}
                  </a>
                ) : (
                  <p className="text-sm text-ink">{p.contact}</p>
                ))}
              {leader && !p.mine && (
                <ActionForm action={removeCarpool} submit="Remove (leaders)" buttonClass="text-xs font-bold text-muted underline" className="pt-1" confirm={`Remove ${p.name}'s carpool post?`}>
                  <input type="hidden" name="id" value={p.id} />
                  <TargetField target={target} />
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PostForm({ target, post }: { target: CarpoolTarget; post: CarpoolPost | null }) {
  return (
    <ActionForm action={saveCarpool} submit={post ? "Save changes" : "Post"} buttonClass="btn-primary w-full py-2" className="space-y-3 pt-3" resetOnSuccess={false}>
      <TargetField target={target} />
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Seats or a ride</legend>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-bold text-ink has-[:checked]:border-pine has-[:checked]:bg-mint">
          <input type="radio" name="kind" value="offer" defaultChecked={post ? post.kind === "offer" : true} className="accent-pine" />
          We have seats
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-bold text-ink has-[:checked]:border-pine has-[:checked]:bg-mint">
          <input type="radio" name="kind" value="need" defaultChecked={post?.kind === "need"} className="accent-pine" />
          We need a ride
        </label>
      </fieldset>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Field label="Seats">
          <input className="input" type="number" name="seats" min={1} max={8} step={1} inputMode="numeric" defaultValue={post?.seats ?? 1} required />
        </Field>
        <Field label="Leaving from (optional)">
          <input className="input" name="leaving_from" maxLength={80} defaultValue={post?.leaving_from ?? ""} placeholder="e.g. Ellicott City, Friday 5 pm" />
        </Field>
      </div>
      <Field label="Contact (optional)" hint="A cell number families can text, or an email. Leave it blank and they can reach you in the event's Signal group.">
        <input className="input" name="contact" maxLength={120} defaultValue={post?.contact ?? ""} autoComplete="tel" />
      </Field>
      <Field label="Note (optional)">
        <textarea className="input min-h-16" name="note" maxLength={300} defaultValue={post?.note ?? ""} placeholder="Room for gear? Coming Saturday only?" />
      </Field>
    </ActionForm>
  );
}
