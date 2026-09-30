"use client";

import { useActionState, useState } from "react";
import { Megaphone } from "lucide-react";
import { postAnnouncement, type PostState } from "@/app/(app)/actions";

const CATEGORIES = ["General", "Campout", "Pack Meeting", "Den", "Derby", "Service", "Fundraiser"];

export default function PostAnnouncement() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PostState, FormData>(async (prev, form) => {
    const result = await postAnnouncement(prev, form);
    if (result.ok) setOpen(false);
    return result;
  }, {});

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost w-full">
        <Megaphone className="h-4 w-4" aria-hidden /> Post an announcement
      </button>
    );
  }
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-bold text-pine-950">New announcement</h2>
      <input name="title" required maxLength={140} placeholder="Title" className="input" />
      <textarea name="body" required rows={4} maxLength={4000} placeholder="Message for pack families" className="input" />
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
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="hidden" name="notify" value="off" />
        <input type="checkbox" name="notify" value="on" defaultChecked className="h-4 w-4 accent-pine" /> Send a phone alert to
        families who turned alerts on
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={pending}>
          {pending ? "Posting…" : "Post"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
