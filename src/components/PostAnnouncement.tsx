"use client";

import { useSubmitKeepingValues } from "@/components/ActionForm";
import { useActionState, useState } from "react";
import { Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { postAnnouncement, type PostState } from "@/app/(app)/actions";

const CATEGORIES = ["General", "Campout", "Pack Meeting", "Den", "Derby", "Service", "Fundraiser"];

/**
 * Leaders post to the whole pack, or message one den's families (den leaders: their own dens;
 * committee members: any den). Den messages can also go out by email.
 */
export default function PostAnnouncement({
  dens,
  canPostPack = true,
  defaultDen = "",
  packEmail = false,
  startOpen = false,
  doneHref,
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
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [den, setDen] = useState(defaultDen || (canPostPack ? "" : (dens[0]?.id ?? "")));
  const [state, action, pending] = useActionState<PostState, FormData>(async (prev, form) => {
    const result = await postAnnouncement(prev, form);
    if (result.ok) {
      setOpen(false);
      if (doneHref) router.push(doneHref);
    }
    return result;
  }, {});
  const keep = useSubmitKeepingValues(action);
  const denName = dens.find((d) => d.id === den)?.name;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost w-full">
        <Megaphone className="h-4 w-4" aria-hidden /> {canPostPack ? "Post an announcement or den message" : "Message my den"}
      </button>
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
          <select name="category" className="input w-auto py-2 text-sm" defaultValue="General">
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
        <button type="submit" className="btn-primary flex-1" disabled={pending}>
          {pending ? "Sending…" : den ? "Send to the den" : "Post"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
