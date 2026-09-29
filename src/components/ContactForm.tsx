"use client";

import { useActionState } from "react";
import { updateMyContact, type PostState } from "@/app/(app)/actions";

export default function ContactForm({ phone, preferred }: { phone: string | null; preferred: string | null }) {
  const [state, action, pending] = useActionState<PostState, FormData>(updateMyContact, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Name you go by</span>
        <input name="preferred_name" defaultValue={preferred ?? ""} maxLength={40} className="input" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Mobile phone</span>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone ?? ""} maxLength={40} className="input" />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-pine">Saved.</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
