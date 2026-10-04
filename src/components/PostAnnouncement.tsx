"use client";

import { failedCallMessage, useSubmitKeepingValues } from "@/components/ActionForm";
import { useActionState, useState } from "react";
import { CircleCheck, Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { postAnnouncement, type PostState } from "@/app/(app)/actions";

/** Who an event message goes to (same values as EventAudience in lib/audience). */
type EventAudience = "going" | "going_maybe" | "no_answer";

const CATEGORIES = ["General", "Campout", "Pack Meeting", "Den", "Derby", "Service", "Fundraiser"];

/**
 * Leaders post to the whole pack, or message one den's families (den leaders: their own dens;
 * pack leadership: any den). Den messages can also go out by email.
 */
export default function PostAnnouncement({
  dens,
  canPostPack = true,
  defaultDen = "",
  packEmail = false,
  startOpen = false,
  doneHref,
  event,
}: {
  dens: { id: string; name: string }[];
  canPostPack?: boolean;
  defaultDen?: string;
  /** Pack-wide email is set up (Brevo). */
  packEmail?: boolean;
  /** Show the form right away (the Announce page). */
  startOpen?: boolean;
  /** Where to go once it's posted (the Announce page goes to Notifications). */
  doneHref?: string;
  /**
   * Message families about this event instead: those going (default), going and maybe (with the
   * waitlist), or those it's for who haven't answered. Counts are families.
   */
  event?: {
    id: string;
    title: string;
    yes: number;
    maybe: number;
    waitlist?: number;
    noAnswer?: number;
    signal?: boolean;
    /** Which audience starts picked. */
    audience?: EventAudience;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [den, setDen] = useState(defaultDen || (canPostPack ? "" : (dens[0]?.id ?? "")));
  // Set once a post goes through: the button stays off (and says Sent) so a slow redirect or
  // a second tap can't send it twice. Opening the form again starts a new message.
  const [sent, setSent] = useState(false);
  const [state, action, pending] = useActionState<PostState, FormData>(async (prev, form) => {
    let result: PostState;
    try {
      result = await postAnnouncement(prev, form);
    } catch (e) {
      // Unlike a save, sending twice would alert families twice: say so instead of "tap again".
      const msg = failedCallMessage(e);
      return {
        error: msg.startsWith("No connection")
          ? "The connection dropped, so it may or may not have gone out. Check the news before you send it again; what you typed is still here."
          : "Something went wrong on our end, so it may not have gone out. Check the news before you send it again.",
      };
    }
    if (result.ok) {
      setSent(true);
      setOpen(false);
      if (doneHref) router.push(doneHref);
    }
    return result;
  }, {});
  const keep = useSubmitKeepingValues(action);
  const denName = dens.find((d) => d.id === den)?.name;
  const [audience, setAudience] = useState<EventAudience>(event?.audience ?? "going");

  if (event) {
    const counts: Record<EventAudience, number> = {
      going: event.yes,
      going_maybe: event.yes + event.maybe + (event.waitlist ?? 0),
      no_answer: event.noAnswer ?? 0,
    };
    const n = counts[audience];
    const families = `${n} ${n === 1 ? "family" : "families"}`;
    const options: { value: EventAudience; label: string; hint: string }[] = [
      { value: "going", label: "Going", hint: `${event.yes} ${event.yes === 1 ? "family" : "families"}` },
      {
        value: "going_maybe",
        label: event.waitlist ? "Going, maybe and waitlist" : "Going and maybe",
        hint: `${counts.going_maybe} ${counts.going_maybe === 1 ? "family" : "families"}`,
      },
      { value: "no_answer", label: "No answer yet", hint: `${counts.no_answer} ${counts.no_answer === 1 ? "family" : "families"}` },
    ];
    const asking = audience === "no_answer";
    return (
      <form action={action} onSubmit={keep} className="card space-y-3">
        <h2 className="font-bold text-pine-950">{asking ? "Message families who haven't answered" : "Message to families going"}</h2>
        <input type="hidden" name="event_id" value={event.id} />
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-navy">Send to</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Send to">
            {options.map((o) => (
              <label
                key={o.value}
                className={`flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border p-2 text-center text-xs font-bold leading-tight ${
                  audience === o.value ? "border-pine bg-brand text-white" : "border-line bg-card text-navy"
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value={o.value}
                  checked={audience === o.value}
                  onChange={() => setAudience(o.value)}
                  className="sr-only"
                />
                {o.label}
                <span className={`mt-0.5 font-normal ${audience === o.value ? "text-white/85" : "text-muted"}`}>{o.hint}</span>
              </label>
            ))}
          </div>
          {asking && (
            <p className="text-[11px] text-muted">
              Families the event is for who haven&apos;t said yes, maybe or no. The alert opens the RSVP.
            </p>
          )}
        </fieldset>
        <input
          name="title"
          required
          maxLength={140}
          placeholder={asking ? "Are you coming? RSVP by Friday" : "Rained out: moved to Sunday"}
          className="input"
        />
        <textarea
          name="body"
          required
          rows={4}
          maxLength={4000}
          placeholder={asking ? `Let us know if you're coming to ${event.title}` : `Message for families going to ${event.title}`}
          className="input"
        />
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="hidden" name="notify" value="off" />
          <input type="checkbox" name="notify" value="on" defaultChecked className="h-4 w-4 accent-pine" /> Send a phone alert to the {families}{" "}
          (those with alerts on)
        </label>
        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="hidden" name="email" value="off" />
          <input type="checkbox" name="email" value="on" className="mt-0.5 h-4 w-4 accent-pine" />
          <span>
            Also email them. Replies come to you.
            <span className="block text-[11px] text-muted">It also shows in the app&apos;s news, linked to the event, for anyone who looks.</span>
          </span>
        </label>
        {event.signal && !asking && (
          <p className="text-xs text-muted">The alert and email end with &ldquo;More in the Signal group,&rdquo; and open the event, where families going can join it.</p>
        )}
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" className={`btn-primary w-full ${pending ? "is-busy" : ""}`} disabled={pending || sent || n === 0}>
          {sent ? (
            <>
              <CircleCheck className="h-4 w-4" aria-hidden /> Sent
            </>
          ) : pending ? (
            "Sending…"
          ) : n === 0 ? (
            asking ? "Everyone has answered" : "Nobody has said yes yet"
          ) : (
            `Send to ${families}`
          )}
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {sent && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-pine" role="status">
            <CircleCheck className="h-4 w-4" aria-hidden /> Sent
          </p>
        )}
        <button
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
          className="btn-ghost w-full"
        >
          <Megaphone className="h-4 w-4" aria-hidden /> {canPostPack ? "Post an announcement or den message" : "Message my den"}
        </button>
      </div>
    );
  }
  return (
    <form action={action} onSubmit={keep} className="card space-y-3">
      <h2 className="font-bold text-pine-950">{den ? `Message to ${denName} families` : "New pack announcement"}</h2>
      {(dens.length > 0 || !canPostPack) && (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Send to</span>
          <select name="den_id" className="input" value={den} onChange={(e) => setDen(e.target.value)}>
            {canPostPack && <option value="">Whole pack</option>}
            {dens.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} families
              </option>
            ))}
          </select>
        </label>
      )}
      <input name="title" required maxLength={140} placeholder={den ? "Bring a flashlight Monday" : "Title"} className="input" />
      <textarea
        name="body"
        required
        rows={4}
        maxLength={4000}
        placeholder={den ? `Message for ${denName} parents` : "Message for pack families"}
        className="input"
      />
      {!den && (
        <div className="flex items-center gap-3">
          <select name="category" className="input w-auto py-2" defaultValue="General">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-navy">
            <input type="checkbox" name="pinned" className="h-4 w-4 accent-pine" /> Pin to top
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="hidden" name="notify" value="off" />
        <input type="checkbox" name="notify" value="on" defaultChecked className="h-4 w-4 accent-pine" /> Send a phone alert to{" "}
        {den ? "the den's families" : "families"} who turned alerts on
      </label>
      {!den && packEmail && (
        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="hidden" name="email" value="off" />
          <input type="checkbox" name="email" value="on" className="mt-0.5 h-4 w-4 accent-pine" />
          <span>
            Also email every family on the roster. Replies come to you.
            <span className="block text-[11px] text-muted">Save this for news everyone needs; phone alerts reach people faster.</span>
          </span>
        </label>
      )}
      {den && (
        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="hidden" name="email" value="off" />
          <input type="checkbox" name="email" value="on" defaultChecked className="mt-0.5 h-4 w-4 accent-pine" />
          <span>
            Also email the den&apos;s parents. Replies come to you.
            <span className="block text-[11px] text-muted">Messages go to parents and the den&apos;s leaders only, never to scouts.</span>
          </span>
        </label>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={`btn-primary flex-1 ${pending ? "is-busy" : ""}`} disabled={pending || sent}>
          {sent ? (
            <>
              <CircleCheck className="h-4 w-4" aria-hidden /> Sent
            </>
          ) : pending ? (
            "Sending…"
          ) : den ? (
            "Send to the den"
          ) : (
            "Post"
          )}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
